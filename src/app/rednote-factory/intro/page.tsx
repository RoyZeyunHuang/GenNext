import Link from "next/link";
import {
  ArrowRight,
  MessageCircle,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Building2,
  FolderOpen,
  Users,
  Newspaper,
  MessageSquareHeart,
  ChevronDown,
  Instagram,
  Mic,
  Search,
} from "lucide-react";

export const metadata = {
  title: "Rednote Factory · 内测介绍",
  description: "小红书文案 + 房源检索 + 多平台分发 · AI 创作工作台",
};

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  tag: string;
  oneLiner: string;
  detail: string;
};

const FEATURES: Feature[] = [
  {
    icon: MessageCircle,
    name: "小黑",
    tag: "聊天助手",
    oneLiner: "一句话要房源、要文案、要查词，全扔给它。",
    detail:
      "24 小时赛博牛马。支持自然语言问房（「LIC 3500 以下的 studio」）、按人设生成小红书 / IG / 口播文案、直接把结果丢去查违禁词。不用学指令，像发微信一样发就行。",
  },
  {
    icon: Sparkles,
    name: "黑魔法",
    tag: "AI 文案",
    oneLiner: "选人设 + 选平台 + 选字数，生成带标题的文案。",
    detail:
      "基于 RAG 的人设库写作：自动带上该人设的语气、高频用词、引用素材。支持小红书笔记 / Instagram caption / 口播稿三种形态，长短可调，生成后一键查违禁词、一键收藏。",
  },
  {
    icon: ShieldAlert,
    name: "违禁词查词",
    tag: "合规",
    oneLiner: "粘贴文案，高 / 中 / 低风险词直接标出来。",
    detail:
      "覆盖小红书平台违禁词 + 地产、医疗、广告法行业规则。可以从小黑或黑魔法一键送检，改完再回来继续写。",
  },
  {
    icon: Building2,
    name: "房源",
    tag: "库存",
    oneLiner: "可按户型 / 预算 / 区域 / 楼盘 / 配套搜索。",
    detail:
      "StreetEasy 数据 + 自有楼盘库。在小黑里可以直接比较两套户型，也可以把某套房塞进黑魔法做素材，写出来的文案自带真实信息。",
  },
  {
    icon: FolderOpen,
    name: "素材库",
    tag: "文档",
    oneLiner: "按分类管理参考文案 / 卖点 / 产品资料。",
    detail:
      "支持打标签、按标题模板归档。黑魔法生成时可以选择调用哪些素材，避免 AI 自由发挥写出不符合实际情况的内容。",
  },
  {
    icon: Users,
    name: "我的团队",
    tag: "协作",
    oneLiner: "管理团队成员和各自的权限。",
    detail:
      "同一个组共享素材与人设，管理员能看到谁在用、配额还剩多少，适合小团队一起运营账号。",
  },
  {
    icon: Newspaper,
    name: "新闻推送",
    tag: "选题",
    oneLiner: "每天推行业简报 + 社媒热门选题。",
    detail:
      "左边行业简报（地产 / 政策 / 市场），右边社媒选题（小红书爆款、平台风向）。看到有用的直接收藏进素材库，下次写文案调用。",
  },
  {
    icon: MessageSquareHeart,
    name: "反馈",
    tag: "配额",
    oneLiner: "用够 10 次后填反馈，解锁更多生成次数。",
    detail:
      "每周有生成配额限制。超过后可以申请 +15 次 / 次，管理员同意即生效。希望你遇到问题就来这里留一条，产品是被骂出来的。",
  },
];

type Capability = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
};

const CAPABILITIES: Capability[] = [
  { icon: Sparkles, label: "小红书", sub: "爆款笔记 · 标题 · 正文" },
  { icon: Instagram, label: "Instagram", sub: "英文 caption · 双语版本" },
  { icon: Mic, label: "口播稿", sub: "视频口播 · 直播脚本" },
  { icon: Search, label: "房源检索", sub: "自然语言问房 · 筛选" },
  { icon: ShieldCheck, label: "违禁词", sub: "小红书 + 地产合规规则" },
  { icon: Users, label: "团队协作", sub: "同组共享素材与人设" },
];

type Step = {
  n: string;
  title: string;
  detail: string;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "在末尾申请内测，等通知邮件",
    detail:
      "@nystudents.net / @uswoony.com / @theairea.com 邮箱直接注册即用。其他邮箱会进入申请队列，一般 24 小时内审核完成，通过后邮箱会收到通知。",
  },
  {
    n: "02",
    title: "登录后默认进入「黑魔法」",
    detail:
      "选一个人设（没有的话先去素材库建一个），选平台（小红书 / IG / 口播），选字数，点击生成。不满意就换个人设再试。",
  },
  {
    n: "03",
    title: "不想配置？直接开小黑",
    detail:
      "打开「小黑」页面，告诉它你要干嘛：「帮我写一篇 LIC 新盘 studio 的小红书」。它会自己去房源库找数据、按默认人设写，写完你说「查一下违禁词」它就顺手查完。",
  },
  {
    n: "04",
    title: "写完一定要查违禁词",
    detail:
      "小红书限流主要就是踩词。从小黑 / 黑魔法里可以一键丢给「违禁词查词」，改完再发。",
  },
  {
    n: "05",
    title: "配额用完就去反馈页申请",
    detail:
      "每周配额有限。写一句真实反馈（喜欢什么、讨厌什么、缺什么），管理员会发多 15 次。这不是客套话，产品组真的在看。",
  },
];

export default function RfIntroPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#1C1917]">
      {/* 顶部强提示条：告诉用户链接在末尾 */}
      <div className="sticky top-0 z-20 border-b border-[#E7E5E4] bg-[#1C1917] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-2.5 text-[12px] sm:text-[13px]">
          <span className="truncate">
            内测申请入口在页面<span className="font-bold">最底部</span>，先往下看一遍再申请。
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="#apply"
              className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 font-medium text-white transition hover:bg-white/20"
            >
              直达末尾
              <ChevronDown className="h-3.5 w-3.5" />
            </a>
            <Link
              href="/rednote-factory/login"
              className="rounded-full bg-white px-3 py-1 font-semibold text-[#1C1917] transition hover:bg-[#F5F5F4]"
            >
              登录
            </Link>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 pt-14 pb-10 sm:pt-20 sm:pb-14">
        <div className="text-[30px] font-black tracking-[2px] sm:text-[36px]">REDNOTE</div>
        <div className="mt-1 text-[11px] font-medium tracking-[1.5px] text-[#A8A29E] sm:text-[12px]">
          FACTORY · 内测介绍
        </div>
        <h1 className="mt-8 text-3xl font-bold leading-[1.25] sm:text-4xl sm:leading-[1.2]">
          给小红书 + 地产团队用的
          <br />
          AI 文案工作台。
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-[1.75] text-[#57534E] sm:text-base">
          一边是能查房源的聊天助手「小黑」，一边是带人设 RAG 的文案生成「黑魔法」，再配上违禁词检测 /
          素材库 / 团队协作 / 每日选题推送。开一个标签页，写一天的小红书、IG、口播稿。
        </p>

      </section>

      {/* 能力卡片（替代顶部 tab 药丸） */}
      <section className="mx-auto max-w-5xl px-5 pb-10">
        <div className="text-[11px] font-semibold tracking-[1.5px] text-[#A8A29E]">
          支持的内容 / 能力
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div
              key={c.label}
              className="flex items-center gap-3 rounded-2xl border border-[#E7E5E4] bg-white px-4 py-3.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FAFAF9] ring-1 ring-[#E7E5E4]">
                <c.icon className="h-[18px] w-[18px] text-[#1C1917]" />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-[#1C1917]">{c.label}</div>
                <div className="mt-0.5 text-[11.5px] leading-[1.4] text-[#78716C]">
                  {c.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 功能清单 */}
      <section className="mx-auto max-w-5xl px-5 pb-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold sm:text-2xl">八个功能，看标题就行</h2>
          <span className="text-[12px] text-[#A8A29E]">熟手可以跳过详情</span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article
              key={f.name}
              className="group rounded-2xl border border-[#E7E5E4] bg-white p-5 transition hover:border-[#1C1917]/20 hover:shadow-[0_2px_12px_-4px_rgba(28,25,23,0.08)]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FAFAF9] ring-1 ring-[#E7E5E4]">
                  <f.icon className="h-5 w-5 text-[#1C1917]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-bold">{f.name}</h3>
                    <span className="rounded-full bg-[#F5F5F4] px-2 py-0.5 text-[10px] font-medium text-[#78716C]">
                      {f.tag}
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] font-medium leading-[1.55] text-[#292524]">
                    {f.oneLiner}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-[1.7] text-[#78716C]">
                    {f.detail}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 上手教程 */}
      <section className="mx-auto max-w-5xl px-5 pt-6 pb-12">
        <h2 className="text-xl font-bold sm:text-2xl">五步上手</h2>
        <p className="mt-1 text-[13px] text-[#78716C]">新人从头做一遍，老手扫一眼步骤标题。</p>
        <ol className="mt-6 space-y-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex gap-4 rounded-2xl border border-[#E7E5E4] bg-white p-5"
            >
              <div className="shrink-0 text-[18px] font-black text-[#D6D3D1] tabular-nums">
                {s.n}
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-[1.7] text-[#57534E]">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 常见疑问，压缩版 */}
      <section className="mx-auto max-w-5xl px-5 pb-12">
        <h2 className="text-xl font-bold sm:text-2xl">常被问到的</h2>
        <div className="mt-5 divide-y divide-[#E7E5E4] rounded-2xl border border-[#E7E5E4] bg-white">
          {[
            {
              q: "数据安全吗？",
              a: "素材库和生成记录按组隔离，同组内可见，跨组不可见。不会把你上传的素材拿去训练公模。",
            },
            {
              q: "生成质量不稳定怎么办？",
              a: "先检查人设是否选对、素材是否充分。依然不行就去反馈页写具体 case，产品组会根据反馈调模型和 prompt。",
            },
          ].map((item) => (
            <div key={item.q} className="p-5">
              <div className="text-[14px] font-bold">{item.q}</div>
              <div className="mt-1.5 text-[13px] leading-[1.7] text-[#57534E]">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 末尾 CTA：申请内测 */}
      <section
        id="apply"
        className="border-t border-[#E7E5E4] bg-gradient-to-b from-white to-[#FAFAF9]"
      >
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-[11px] font-semibold tracking-[1.5px] text-[#A8A29E]">
              YOU MADE IT · 到底了
            </div>
            <h2 className="mt-3 text-3xl font-bold leading-[1.25] sm:text-4xl">
              申请内测，24 小时内给答复。
            </h2>
            <p className="mt-4 text-[14.5px] leading-[1.75] text-[#57534E]">
              点下面的按钮进入申请页，填邮箱 + 称呼 + 所在组。审核通过后会自动发邮件，
              下次直接登录进黑魔法。
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/rednote-factory/login"
                className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1C1917] px-8 py-4 text-[15px] font-semibold text-white shadow-[0_4px_20px_-6px_rgba(28,25,23,0.35)] transition hover:bg-[#292524] active:scale-[0.99] sm:w-auto"
              >
                申请内测
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/rednote-factory/login"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#E7E5E4] bg-white px-8 py-4 text-[14px] font-medium text-[#44403C] transition hover:bg-[#F5F5F4] sm:w-auto"
              >
                已有账号，直接登录
              </Link>
            </div>

            <p className="mt-8 text-[11.5px] leading-[1.7] text-[#A8A29E]">
              @nystudents.net / @uswoony.com / @theairea.com 邮箱可直接注册登录，无需等待审核。
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E7E5E4] bg-[#FAFAF9]">
        <div className="mx-auto max-w-5xl px-5 py-6 text-[11px] text-[#A8A29E]">
          © REDNOTE FACTORY · 内测中 · 有事写反馈
        </div>
      </footer>
    </div>
  );
}
