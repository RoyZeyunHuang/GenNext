import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/rednote-factory/login" || pathname === "/rednote-factory/reset-password") {
    return NextResponse.next();
  }

  /** `public/profileimages/*` 静态资源：勿走主站 has_main_access 分支，否则仅 RF 用户会被 302，人设头像裂图 */
  if (pathname.startsWith("/profileimages/")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/rednote-factory/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Rednote Factory routes — any authenticated user can access
  if (pathname.startsWith("/rednote-factory")) {
    return response;
  }

  // Main app routes — require has_main_access in app_metadata
  const hasMainAccess = user.app_metadata?.has_main_access === true;
  if (!hasMainAccess) {
    return NextResponse.redirect(
      new URL("/rednote-factory/copywriter-rag", request.url)
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/).*)"],
};
