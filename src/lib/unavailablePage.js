/**
 * The page a reader meets when every copy of a book is temporarily out of
 * reach. It renders inside the reader's iframe, so it is plain HTML with no
 * dependencies — and it must answer three questions without making the reader
 * guess: what happened, when to come back, and who to ask.
 */

const REASON_COPY = {
  quota: {
    title: 'เล่มนี้มีคนโหลดเยอะเกินไปวันนี้',
    body: 'Google Drive จำกัดจำนวนการดาวน์โหลดต่อไฟล์ในแต่ละวัน เมื่อถึงขีดจำกัดไฟล์จะเปิดไม่ได้ชั่วคราว ไม่ได้หายไปไหน',
    // Google does not publish the exact reset moment, so this is stated as an
    // estimate rather than a countdown we cannot actually compute.
    when: 'ปกติจะกลับมาโหลดได้เองภายใน 24 ชั่วโมง',
  },
  permission: {
    title: 'ไฟล์เล่มนี้ตั้งค่าสิทธิ์ไม่ถูกต้อง',
    body: 'ไฟล์ต้นทางไม่ได้เปิดให้เข้าถึงแบบสาธารณะ ผู้ดูแลต้องแก้ไขก่อนจึงจะเปิดอ่านได้',
    when: 'แจ้งผู้ดูแลเพื่อให้แก้ไขได้เลย',
  },
  missing: {
    title: 'ไม่พบไฟล์ของเล่มนี้',
    body: 'ไฟล์อาจถูกลบออกจากที่เก็บ หรือย้ายไปบัญชีอื่น',
    when: 'แจ้งผู้ดูแลเพื่อให้อัปโหลดใหม่',
  },
  network: {
    title: 'เชื่อมต่อที่เก็บไฟล์ไม่สำเร็จ',
    body: 'ระบบติดต่อ Google Drive ไม่ได้ในขณะนี้ อาจเป็นปัญหาชั่วคราว',
    when: 'ลองใหม่อีกครั้งในอีกสักครู่',
  },
  none: {
    title: 'เล่มนี้ยังไม่มีไฟล์ให้ดาวน์โหลด',
    body: 'หนังสือเล่มนี้อยู่ในคลังแล้ว แต่ยังไม่ได้แนบไฟล์ PDF',
    when: 'ติดต่อผู้ดูแลเพื่อขอไฟล์ได้',
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param reason   key of REASON_COPY
 * @param title    the book's title, for context
 * @param contact  { label, link } — usually the Line OA
 * @param retryUrl optional link that retries via the backup copy
 */
export function unavailableHtml({ reason = 'quota', title = '', contact = null, retryUrl = '' }) {
  const copy = REASON_COPY[reason] || REASON_COPY.quota;

  const contactBlock = contact?.link
    ? `<a class="primary" href="${escapeHtml(contact.link)}" target="_blank" rel="noopener noreferrer">
         ${escapeHtml(contact.label || 'ติดต่อผู้ดูแลเพื่อขอไฟล์')}
       </a>
       <p class="fine">ทักมาได้เลย ผู้ดูแลจะส่งไฟล์ให้โดยตรง</p>`
    : '<p class="fine">กรุณาติดต่อผู้ดูแลระบบเพื่อขอไฟล์</p>';

  const retryBlock = retryUrl
    ? `<a class="ghost" href="${escapeHtml(retryUrl)}">ลองเปิดจากสำเนาสำรอง</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="th"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(copy.title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    display: grid; place-items: center; min-height: 100vh;
    background: #0b0e0d; color: #eef4f1; padding: 2rem; line-height: 1.75;
  }
  .box {
    max-width: 30rem; width: 100%; text-align: center;
    background: #141917; border: 1px solid #222b27;
    border-radius: 20px; padding: 2.5rem 2rem;
  }
  h1 { font-size: 1.2rem; font-weight: 600; margin-bottom: 0.75rem; line-height: 1.5; }
  p { color: #9aa9a3; font-size: 0.92rem; }
  .when {
    margin-top: 1.25rem; padding: 0.75rem 1rem;
    background: #1b221f; border-radius: 12px;
    color: #3ee6a0; font-size: 0.88rem;
  }
  .acts { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1.75rem; }
  a { display: block; text-decoration: none; border-radius: 999px; padding: 0.8rem 1.5rem; font-weight: 600; font-size: 0.92rem; }
  .primary { background: #3ee6a0; color: #04140d; }
  .ghost { background: transparent; color: #9aa9a3; border: 1px solid #303b36; }
  .fine { margin-top: 0.85rem; font-size: 0.8rem; color: #6a7772; }
  .book { margin-top: 1rem; font-size: 0.82rem; color: #6a7772; }
</style>
</head><body>
  <div class="box">
    <h1>${escapeHtml(copy.title)}</h1>
    <p>${escapeHtml(copy.body)}</p>
    <div class="when">${escapeHtml(copy.when)}</div>
    <div class="acts">
      ${retryBlock}
      ${contactBlock}
    </div>
    ${title ? `<p class="book">${escapeHtml(title)}</p>` : ''}
  </div>
</body></html>`;
}
