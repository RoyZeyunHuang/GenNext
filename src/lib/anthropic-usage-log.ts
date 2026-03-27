/**
 * 仅用于从总 input_tokens 中扣除「用户输入框」文案的粗略估算（约 4 字符 ≈ 1 token，中英混合仅供参考）。
 * 精确计费以 Anthropic 返回的 usage.input_tokens 为准。
 */
export function roughTokenEstimateUserInput(userInput: string): number {
  const s = userInput.trim();
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}

/**
 * input_tokens：API 返回的本次请求输入 token（含 system + tools + 完整 user 消息等）。
 * approx_excl_user_textarea：从 input_tokens 中减去 user_input 的粗略估算，**不包含**正文/标题等其它 user 消息字段。
 */
export function logAnthropicInputUsage(params: {
  phase: string;
  inputTokens: number | undefined;
  userInputForExclusionEstimate: string;
}): void {
  const { phase, inputTokens, userInputForExclusionEstimate } = params;
  if (inputTokens === undefined) return;
  const minusUser = roughTokenEstimateUserInput(userInputForExclusionEstimate);
  const approxExcl = Math.max(0, inputTokens - minusUser);
  const shouldLog =
    process.env.ANTHROPIC_LOG_USAGE === "1" || process.env.NODE_ENV === "development";
  if (!shouldLog) return;
  console.info(
    `[anthropic/generate] phase=${phase} input_tokens=${inputTokens} approx_input_excl_user_textarea=${approxExcl} (minus ~${minusUser} est. for user_input only)`
  );
}

export function usageMetaHeaders(
  inputTokens: number | undefined,
  userInputForExclusionEstimate: string
): Record<string, string> {
  if (inputTokens === undefined) return {};
  const minusUser = roughTokenEstimateUserInput(userInputForExclusionEstimate);
  const approxExcl = Math.max(0, inputTokens - minusUser);
  return {
    "X-GN-Input-Tokens": String(inputTokens),
    "X-GN-Approx-Input-Tokens-Excl-User-Textarea": String(approxExcl),
  };
}
