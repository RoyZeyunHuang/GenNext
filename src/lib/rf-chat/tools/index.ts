import type { Tool } from "../types";
import { listAreasTool } from "./list-areas";
import { listNeighborhoodsTool } from "./list-neighborhoods";
import { listAmenitiesTool } from "./list-amenities";
import { listPersonasTool } from "./list-personas";
import { searchBuildingsTool } from "./search-buildings";
import { getBuildingTool } from "./get-building";
import { getListingTool } from "./get-listing";
import { searchPersonaNotesTool } from "./search-persona-notes";
import { searchDocsTool } from "./search-docs";
import { generateCopyTool } from "./generate-copy";
import { askUserTool } from "./ask-user";

/**
 * 所有工具的真实来源。registry.ts 从这里读。
 */
export const ALL_TOOLS: Tool[] = [
  // 枚举
  listAreasTool as Tool,
  listNeighborhoodsTool as Tool,
  listAmenitiesTool as Tool,
  listPersonasTool as Tool,
  // 搜索 + 详情
  searchBuildingsTool as Tool,
  getBuildingTool as Tool,
  getListingTool as Tool,
  searchPersonaNotesTool as Tool,
  searchDocsTool as Tool,
  // 生成（扣额度）
  generateCopyTool as Tool,
  // 交互
  askUserTool as Tool,
];
