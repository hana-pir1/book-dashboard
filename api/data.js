// 노션 API를 서버(Vercel) 쪽에서 안전하게 호출하는 함수.
// 토큰이 브라우저에 노출되지 않고, 여기서만 사용됩니다.
// 날짜별 조회를 지원하기 위해, 페이지네이션으로 전체 기록을 가져옵니다.

const NOTION_VERSION = "2022-06-28";
const RANKING_DB_ID = "3b7688dd-b51f-81c1-a0f2-c06f50bfd20e";
const SNS_HOT_DB_ID = "3b7688dd-b51f-81f0-8558-cc58f9c74210";
const IDEA_DB_ID = "bc439154-5d90-4184-9175-7e9ef73d7794"; // Today's Idea
const MAX_PAGES = 6; // 1회 최대 600건까지 (100 x 6). 필요시 늘릴 수 있음.

async function queryDatabase(dbId, token) {
  let results = [];
  let cursor = undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = {
      sorts: [{ property: "날짜", direction: "descending" }],
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    results = results.concat(json.results || []);
    if (!json.has_more) break;
    cursor = json.next_cursor;
  }
  return results;
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
    const [rankingPages, snsPages, ideaPages] = await Promise.all([
      queryDatabase(RANKING_DB_ID, token),
      queryDatabase(SNS_HOT_DB_ID, token),
      queryDatabase(IDEA_DB_ID, token),
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

    const idea = ideaPages.map((p) => ({
      hook: getText(p.properties["후킹 문구"]),
      book: getText(p.properties["관련 책"]),
      author: getText(p.properties["저자"]),
      date: getText(p.properties["날짜"]),
      reason: getText(p.properties["근거"]),
    }));

    const dates = Array.from(
      new Set(
        [...ranking.map((b) => b.date), ...sns.map((b) => b.date), ...idea.map((b) => b.date)].filter(
          Boolean
        )
      )
    ).sort((a, b) => (a < b ? 1 : -1)); // 최신순

    res.setHeader("Cache-Control", "s-maxage=1800"); // 30분 캐시
    res.status(200).json({ ranking, sns, idea, dates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
