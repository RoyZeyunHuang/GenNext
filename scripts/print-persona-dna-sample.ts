/**
 * 本地演示：任选三条笔记 → 打印 digestNotesForDna 结果 + prompt 中的风格参考块。
 * 运行：npx tsx scripts/print-persona-dna-sample.ts
 */
import { digestNotesForDna } from "../src/lib/persona-rag/note-digest";
import type { DigestedNote } from "../src/lib/persona-rag/note-digest";
import type { RetrievalMode } from "../src/lib/persona-rag/retrieve-threshold";

const THREE_NOTES = [
  {
    title: "哥大附近2b1b踩坑记录",
    body: `真的别信中介说的「步行10分钟」😭 我实测冬天走一趟要15分钟还要过桥。房租我们谈下来是4200不含水电，签约前一定要看清是不是 gross rent。室友是在校群捞的，目前还行。楼下就是缺德舅，这点救大命。最后提醒大家：看房最好选白天，晚上那栋楼门禁灯坏了一半我差点没敢进…`,
  },
  {
    title: "纽约留学生第一次签lease我学到了啥",
    body: `当时完全懵，guarantor 找了第三方付了一笔 fee 才过。Lease 上有一条 late fee 写得很小字，我后来用荧光笔标出来了📝 建议大家都拍照存档，邮件往来也留底。心态上就是：别急，多问一句不丢人。`,
  },
  {
    title: "周末去法拉盛囤货的一点点心得",
    body: `地铁倒两次有点累但蔬菜真的便宜一半。我会背个空箱子去，回来手断🤣 别周末下午去人太多。回家路上买了杯奶茶，幸福很简单啦～`,
  },
];

function formatStyleBlockForPrint(notes: DigestedNote[], mode: RetrievalMode): string {
  if (notes.length === 0) return "(空)";

  let preamble = "";
  if (mode === "topic_aligned") {
    preamble = `下面是你以前写过的几篇笔记里摘出的句子。这次主题比较接近，所以你可以参考当时的语气和切入角度——但必须写全新的内容，不能把下面任何一句搬进新笔记。`;
  } else if (mode === "topic_loose") {
    preamble = `下面是你以前写过的几篇笔记里摘出的句子。这次话题不太一样，所以只看你"怎么说话"就好——句子的节奏、用词、emoji 的感觉。话题完全听用户的。`;
  } else {
    preamble = `下面是你以前写过的几篇笔记里摘出的句子。这次话题完全不同，所以只看说话习惯——断句方式、口头禅、emoji 节奏。不要把下面的任何话题、地名、品牌带到新笔记里。`;
  }

  const blocks = notes.map((n) => {
    const lines: string[] = [];
    lines.push(`「${n.title}」里你是这样说话的：`);
    for (const s of n.sampleSentences) {
      lines.push(`  ${s}`);
    }
    if (n.emojiList.length > 0) {
      lines.push(`  （这篇里你用了：${n.emojiList.join("")}）`);
    }
    return lines.join("\n");
  });

  return `---\n${preamble}\n\n${blocks.join("\n\n")}`;
}

const modes: RetrievalMode[] = ["topic_aligned", "topic_loose", "style_only"];

console.log("假设 RAG 命中以下 3 条笔记：\n");
THREE_NOTES.forEach((n, i) => {
  console.log(`--- 笔记 ${i + 1}: ${n.title} ---`);
  console.log(n.body, "\n");
});

for (const mode of modes) {
  const digested = digestNotesForDna(THREE_NOTES, mode);
  console.log("\n\n████████████████████████████████████████████████████████████");
  console.log(`retrievalMode = ${mode}`);
  console.log("████████████████████████████████████████████████████████████\n");
  console.log("【JSON 结构】\n");
  console.log(JSON.stringify(digested, null, 2));
  console.log("\n【拼进 prompt 末尾的风格参考块】\n");
  console.log(formatStyleBlockForPrint(digested, mode));
}
