# RednoteFactory（/rednote-factory）与 Supabase Auth

子路径应用使用 **Supabase Auth（邮箱密码）** 保护除 `/rednote-factory/login` 以外的所有 `/rednote-factory` 路由。主应用（`/dashboard`、`/crm` 等）仍不经过 Auth，与现有行为一致。

## 在 Supabase Dashboard 中需要完成的配置

1. 打开项目 → **Authentication** → **Providers** → **Email**，启用 **Email** 提供商。
2. **Authentication** → **URL configuration**：
   - **Site URL**：填写生产环境根地址（如 `https://your-domain.com`）。
   - **Redirect URLs**：加入你的站点地址，并确保包含子路径应用会使用到的 origin（例如 `https://your-domain.com/**` 或显式列出 `https://your-domain.com/rednote-factory/**`），以便邮件确认链接可正确跳回。
3. 若希望注册后**无需邮箱确认即可登录**：在 **Authentication** → **Providers** → **Email** 中关闭 **Confirm email**（按你的安全策略决定）。

## 环境变量

与主应用相同，使用：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `RF_ADMIN_EMAILS`（可选）：逗号分隔邮箱。列为管理员的账号可在内容工厂中创建/编辑**公共**分类与文档；其他登录用户仅能管理自己的私有内容。未配置时无人具备该能力（公共内容只读）。

Auth 会话通过 `@supabase/ssr` 写入 **HttpOnly cookie**，由根目录 [`middleware.ts`](../middleware.ts) 在匹配 `/rednote-factory` 时刷新并校验。

## API 说明

`/rednote-factory` 由 Middleware 强制登录；浏览器携带的 Supabase cookie 在调用同源 `/api/docs/*` 时会被 Route Handler 读取。若存在会话，列表接口仅返回 **公共**（`owner_id` 为空）与 **当前用户私有** 的分类/文档；写操作会校验所有者或 `RF_ADMIN_EMAILS` 管理员。主站（无登录 cookie）调用 `/api/docs/*` 时行为与以前一致，仍可读写全部数据（依赖现有 RLS/anon 策略）。

`/api/ai/*` 等其它接口的鉴权策略未在此文档展开。
