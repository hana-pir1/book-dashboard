// 노션 API를 서버(Vercel) 쪽에서 안전하게 호출하는 함수.
// 토큰이 브라우저에 노출되지 않고, 여기서만 사용됩니다.

const NOTION_VERSION = "2022-06-28";
const RANKING_DB_ID = "3b7688dd-b51f-81c1-a0f2-c06f50bfd20e";
const SNS_HOT_DB_ID = "3b7688dd-b51f-81f0-8558-cc58f9c74210";

async function queryDatabase(dbId, token) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      sorts: [{ property: "날짜", direction: "descending" }],
      page_size: 100,
    }),
  });
  const json = await res.json();
  return json.results || [];
}

function getText(prop) {
  if (!prop) return "";
  if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("");
  if (prop.type === "rich_text") return prop.rich_text.map((t) => t.plain_text).join("");
  if (prop.type === "select") return prop.select ? prop.select.name : "";
  if (prop.type === "number") return prop.number;
  if (prop.type === "date") return prop.date ? prop.date.start : "";
  if (prop.type === "url") return prop.url || "";
  return "";
}

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;

  try {
    const [rankingPages, snsPages] = await Promise.all([
      queryDatabase(RANKING_DB_ID, token),
      queryDatabase(SNS_HOT_DB_ID, token),
    ]);

    const ranking = rankingPages.map((p) => ({
      title: getText(p.properties["제목"]),
      date: getText(p.properties["날짜"]),
      platform: getText(p.properties["플랫폼"]),
      rank: getText(p.properties["순위"]),
      author: getText(p.properties["저자"]),
      publisher: getText(p.properties["출판사"]),
      url: getText(p.properties["URL"]),
    }));

    const sns = snsPages.map((p) => ({
      title: getText(p.properties["제목"]),
      date: getText(p.properties["날짜"]),
      author: getText(p.properties["저자"]),
      intro: getText(p.properties["책소개"]),
      url: getText(p.properties["URL"]),
    }));

    // 가장 최신 날짜만 필터링
    const latestRankingDate = ranking.reduce((max, b) => (b.date > max ? b.date : max), "");
    const latestSnsDate = sns.reduce((max, b) => (b.date > max ? b.date : max), "");

    res.setHeader("Cache-Control", "s-maxage=1800"); // 30분 캐시
    res.status(200).json({
      ranking: ranking.filter((b) => b.date === latestRankingDate),
      sns: sns.filter((b) => b.date === latestSnsDate),
      rankingDate: latestRankingDate,
      snsDate: latestSnsDate,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
