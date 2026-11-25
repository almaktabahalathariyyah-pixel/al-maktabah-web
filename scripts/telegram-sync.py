"""
Al-Maktabah Al-Athariyyah — Telegram Multi-Group + Google Drive Folder Auto-Sync

Supports:
  - Multiple Telegram groups/channels (comma-separated in TG_CHAT_NAME)
  - Direct Telegram PDF attachments (up to 2 GB via Telethon/MTProto)
  - Individual Google Drive file links
  - Public Google Drive FOLDERS (recursively expanded to every PDF inside!)
  - Incremental sync (--incremental) remembering last_message_id per chat

Usage:
  python scripts/telegram-sync.py --scan              # Full scan of all configured groups
  python scripts/telegram-sync.py --incremental       # Only new messages since last sync
  python scripts/telegram-sync.py --scan --download   # Scan + download missing Telegram PDFs
  python scripts/telegram-sync.py --scan --qr         # First-time login via QR code
"""

import argparse
import asyncio
import html as html_lib
import json
import os
import re
import subprocess
import unicodedata
import urllib.request
from pathlib import Path

from telethon import TelegramClient
from telethon.tl.types import DocumentAttributeFilename

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = Path(__file__).resolve().parent
ENV_FILE = REPO_ROOT / ".env.telegram"
SESSION_PATH = SCRIPTS_DIR / ".telegram-sync"
STATE_FILE = SCRIPTS_DIR / ".telegram-sync-state.json"
MISSING_FILE = SCRIPTS_DIR / ".telegram-missing.json"
DOWNLOAD_DIR = SCRIPTS_DIR / ".telegram-downloads"

DRIVE_FILE_RE = re.compile(
    r"https?://(?:drive\.google\.com/(?:file/d/|open\?id=|uc\?[^\s]*?id=)|drive\.usercontent\.google\.com/download\?[^\s]*?id=)([a-zA-Z0-9_-]{20,})"
)
DRIVE_FOLDER_RE = re.compile(
    r"https?://drive\.google\.com/drive/(?:u/\d+/)?folders/([a-zA-Z0-9_-]{20,})"
)


def load_env():
    env = dict(os.environ)
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return env


def norm_key(text: str) -> str:
    s = unicodedata.normalize("NFD", str(text or "").lower())
    s = re.sub(r"[\u0300-\u036f\u0e3a\u0e4c]", "", s)
    s = re.sub(r"\.pdf$", "", s, flags=re.I)
    s = re.sub(r"[^\w\u0e00-\u0e7f\u0600-\u06ff]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def drive_id_from(url: str) -> str:
    if not url:
        return ""
    m = re.search(r"/file/d/([a-zA-Z0-9_-]+)|[?&]id=([a-zA-Z0-9_-]+)", url)
    return (m.group(1) or m.group(2)) if m else ""


def expand_drive_folder(folder_id: str, depth: int = 0, max_depth: int = 3, seen: set | None = None) -> list[dict]:
    if seen is None:
        seen = set()
    if folder_id in seen or depth > max_depth:
        return []
    seen.add(folder_id)
    url = f"https://drive.google.com/embeddedfolderview?id={folder_id}#list"
    try:
        raw = urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
            timeout=20,
        ).read().decode("utf-8", "ignore")
    except Exception:
        return []

    found = []
    for m in re.finditer(
        r'href="https://drive\.google\.com/file/d/([a-zA-Z0-9_-]+)/view[^"]*"[^>]*>.*?class="flip-entry-title"[^>]*>([^<]+)<',
        raw,
        re.S,
    ):
        did = m.group(1)
        name = html_lib.unescape(m.group(2)).strip()
        if name.lower().endswith(".pdf"):
            found.append({"drive_id": did, "filename": name, "from_folder": folder_id})

    for m in re.finditer(
        r'href="https://drive\.google\.com/drive/folders/([a-zA-Z0-9_-]+)[^"]*"[^>]*>.*?class="flip-entry-title"[^>]*>([^<]+)<',
        raw,
        re.S,
    ):
        sfid = m.group(1)
        if sfid != folder_id:
            found.extend(expand_drive_folder(sfid, depth + 1, max_depth, seen))
    return found


def fetch_firestore_books(key_path: str) -> list[dict]:
    node_code = r"""
const fs = require('fs');
const crypto = require('crypto');
const keyPath = process.argv[1];
const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const b64 = (s) => Buffer.from(s).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const now = Math.floor(Date.now()/1000);
const hdr = b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
const clm = b64(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:sa.token_uri||'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
const sig = crypto.createSign('RSA-SHA256').update(hdr+'.'+clm).sign(sa.private_key,'base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
(async () => {
  const tr = await fetch(sa.token_uri||'https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: hdr+'.'+clm+'.'+sig})
  });
  const { access_token } = await tr.json();
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const qr = await fetch(`${base}:runQuery`, {
    method:'POST', headers:{Authorization:`Bearer ${access_token}`, 'Content-Type':'application/json'},
    body: JSON.stringify({structuredQuery:{from:[{collectionId:'books'}]}})
  });
  const rows = await qr.json();
  const fromV = (v) => !v ? null : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? Number(v.doubleValue) : 'booleanValue' in v ? v.booleanValue : 'arrayValue' in v ? (v.arrayValue.values||[]).map(fromV) : null;
  const out = rows.filter(x=>x.document).map(x => {
    const f = x.document.fields || {};
    return {
      id: x.document.name.split('/').pop(),
      title: fromV(f.title) || '',
      sourceFile: fromV(f.sourceFile) || '',
      driveUrl: fromV(f.driveUrl) || '',
      sizeBytes: Number(fromV(f.sizeBytes) || 0),
    };
  });
  process.stdout.write(JSON.stringify(out));
})();
"""
    res = subprocess.run(
        ["node", "-e", node_code, key_path],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(res.stdout)


async def find_chats(client: TelegramClient, names: list[str]):
    dialogs = []
    async for d in client.iter_dialogs():
        dialogs.append(d)
    matched = []
    for name in names:
        needle = name.strip().lower()
        if not needle:
            continue
        hit = next((d.entity for d in dialogs if d.name and needle in d.name.lower()), None)
        if hit:
            matched.append((name.strip(), hit))
        else:
            print(f"WARNING: Telegram chat not found: {name!r}", flush=True)
    return matched


async def run_sync(args):
    env = load_env()
    api_id = env.get("TG_API_ID")
    api_hash = env.get("TG_API_HASH")
    chat_names = [c.strip() for c in (args.chat or env.get("TG_CHAT_NAME", "Al-Maktabah Al-Athariyyah")).split(",") if c.strip()]
    key_path = env.get("FIREBASE_KEY_PATH", "")

    if not api_id or not api_hash:
        raise SystemExit(f"Missing TG_API_ID / TG_API_HASH in {ENV_FILE}")
    if not key_path or not Path(key_path).exists():
        raise SystemExit(f"FIREBASE_KEY_PATH not found: {key_path!r}")

    print("1. Loading live catalog from Firestore...", flush=True)
    live_books = fetch_firestore_books(key_path)
    existing_drive_ids = {drive_id_from(b["driveUrl"]) for b in live_books if drive_id_from(b["driveUrl"])}
    existing_sizes = {b["sizeBytes"] for b in live_books if b["sizeBytes"] > 10000}
    existing_keys = set()
    for b in live_books:
        if b["title"]:
            existing_keys.add(norm_key(b["title"]))
        if b["sourceFile"]:
            existing_keys.add(norm_key(b["sourceFile"]))
    print(f"   Live Firestore books: {len(live_books)}", flush=True)

    state = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    chats_state = state.get("chats", {})

    client = TelegramClient(str(SESSION_PATH), int(api_id), api_hash)
    await client.connect()
    if not await client.is_user_authorized():
        if args.qr:
            import qrcode
            qr_login = await client.qr_login()
            qr_img_path = SCRIPTS_DIR / ".telegram-qr.png"
            qrcode.make(qr_login.url).save(qr_img_path)
            print(f"\n>>> Opening QR code image: {qr_img_path}", flush=True)
            print(">>> On your phone: Telegram -> Settings -> Devices -> Link Desktop Device -> Scan QR!", flush=True)
            try:
                os.startfile(str(qr_img_path))
            except Exception:
                pass
            try:
                await qr_login.wait(timeout=120)
            except Exception as e:
                if "SessionPasswordNeeded" in type(e).__name__ or "password" in str(e).lower():
                    import getpass
                    pw = getpass.getpass("Enter your Telegram 2FA password: ")
                    await client.sign_in(password=pw)
                else:
                    raise
            qr_img_path.unlink(missing_ok=True)
            print(">>> QR login successful!", flush=True)
        else:
            await client.start()

    try:
        targets = await find_chats(client, chat_names)
        if not targets:
            raise SystemExit("No matching Telegram chats found.")

        seen_did = set(existing_drive_ids)
        seen_sz = set(existing_sizes)
        seen_fn = set(existing_keys)
        seen_folders = set()

        missing_drive = []
        missing_pdfs = []
        per_chat_summary = []

        for label, entity in targets:
            cid = str(entity.id)
            title = getattr(entity, "title", label)
            min_id = chats_state.get(cid, {}).get("last_message_id", 0) if args.incremental else 0
            print(f"\n2. Scanning chat: {title} (id={cid}, min_id={min_id})...", flush=True)

            max_msg_id = min_id
            scanned = 0
            c_pdfs = 0
            c_files = 0
            c_folders = 0
            c_folder_pdfs = 0

            async for msg in client.iter_messages(entity, min_id=min_id, reverse=True):
                scanned += 1
                if msg.id > max_msg_id:
                    max_msg_id = msg.id
                text = msg.message or ""
                dt = msg.date.isoformat() if msg.date else ""

                # 1. Individual Google Drive file links
                for m in DRIVE_FILE_RE.finditer(text):
                    c_files += 1
                    did = m.group(1)
                    if did in seen_did:
                        continue
                    seen_did.add(did)
                    missing_drive.append({
                        "kind": "drive_link",
                        "chat": title,
                        "chat_id": entity.id,
                        "msg_id": msg.id,
                        "date": dt,
                        "drive_id": did,
                        "drive_url": f"https://drive.google.com/file/d/{did}/view",
                        "filename": "",
                        "caption": text[:400],
                    })

                # 2. Google Drive FOLDERS (expanded recursively!)
                for m in DRIVE_FOLDER_RE.finditer(text):
                    fid = m.group(1)
                    if fid in seen_folders:
                        continue
                    seen_folders.add(fid)
                    c_folders += 1
                    expanded = expand_drive_folder(fid)
                    c_folder_pdfs += len(expanded)
                    print(f"   Expanded Drive folder {fid} -> {len(expanded)} PDFs", flush=True)
                    for fitem in expanded:
                        did = fitem["drive_id"]
                        fk = norm_key(fitem["filename"])
                        if did in seen_did or (len(fk) >= 6 and fk in seen_fn):
                            continue
                        seen_did.add(did)
                        if fk:
                            seen_fn.add(fk)
                        missing_drive.append({
                            "kind": "drive_folder_pdf",
                            "chat": title,
                            "chat_id": entity.id,
                            "msg_id": msg.id,
                            "date": dt,
                            "from_folder": fitem["from_folder"],
                            "drive_id": did,
                            "drive_url": f"https://drive.google.com/file/d/{did}/view",
                            "filename": fitem["filename"],
                            "caption": text[:400],
                        })

                # 3. Direct Telegram PDF attachments
                if msg.document:
                    mime = (msg.document.mime_type or "").lower()
                    fname = ""
                    for attr in msg.document.attributes or []:
                        if isinstance(attr, DocumentAttributeFilename):
                            fname = attr.file_name
                            break
                    if mime == "application/pdf" or fname.lower().endswith(".pdf"):
                        c_pdfs += 1
                        sz = int(msg.document.size or 0)
                        fn = fname or f"tg_{msg.id}.pdf"
                        fk = norm_key(fn)
                        if (sz > 10000 and sz in seen_sz) or (len(fk) >= 6 and fk in seen_fn):
                            continue
                        if sz > 10000:
                            seen_sz.add(sz)
                        if fk:
                            seen_fn.add(fk)
                        missing_pdfs.append({
                            "kind": "telegram_pdf",
                            "chat": title,
                            "chat_id": entity.id,
                            "msg_id": msg.id,
                            "date": dt,
                            "filename": fn,
                            "size_bytes": sz,
                            "caption": text[:400],
                        })

            chats_state[cid] = {"chat_title": title, "last_message_id": max_msg_id}
            per_chat_summary.append({
                "chat": title,
                "scanned_messages": scanned,
                "tg_pdfs": c_pdfs,
                "drive_file_links": c_files,
                "drive_folders": c_folders,
                "drive_folder_pdfs": c_folder_pdfs,
            })
            print(
                f"   Done {title}: {scanned} msgs | {c_pdfs} TG PDFs | {c_files} Drive files | "
                f"{c_folders} Drive folders ({c_folder_pdfs} PDFs)",
                flush=True,
            )

        report = {
            "chats": per_chat_summary,
            "missing_drive_links": missing_drive,
            "missing_pdfs": missing_pdfs,
        }
        MISSING_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        STATE_FILE.write_text(json.dumps({"chats": chats_state}, ensure_ascii=False, indent=2), encoding="utf-8")

        print("\n=== COMBINED SYNC DIFF SUMMARY ===")
        print(f"Missing Google Drive PDFs (files + folders): {len(missing_drive)}")
        print(f"Missing Telegram PDFs                      : {len(missing_pdfs)}")
        print(f"Report saved to                            : {MISSING_FILE}")

        if args.download and missing_pdfs:
            DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
            print(f"\n3. Downloading {len(missing_pdfs)} missing Telegram PDFs...", flush=True)
            entity_by_id = {e.id: e for _, e in targets}
            for idx, item in enumerate(missing_pdfs, 1):
                safe_name = re.sub(r'[<>:"/\\|?*]', "_", item["filename"])
                out_path = DOWNLOAD_DIR / safe_name
                if out_path.exists() and out_path.stat().st_size == item["size_bytes"]:
                    print(f"   [{idx}/{len(missing_pdfs)}] cached: {safe_name}")
                    continue
                ent = entity_by_id.get(item["chat_id"])
                msg = await client.get_messages(ent, ids=item["msg_id"])
                if msg and msg.document:
                    print(f"   [{idx}/{len(missing_pdfs)}] downloading ({item['size_bytes']/1e6:.1f} MB): {safe_name}", flush=True)
                    await client.download_media(msg, file=str(out_path))
            print("Download complete!")
    finally:
        await client.disconnect()


def main():
    p = argparse.ArgumentParser(description="Sync books from Telegram groups + Drive folders to Al-Maktabah")
    p.add_argument("--scan", action="store_true", help="Full scan of all configured groups")
    p.add_argument("--incremental", action="store_true", help="Only scan messages newer than last_message_id")
    p.add_argument("--download", action="store_true", help="Also download missing Telegram PDFs locally")
    p.add_argument("--qr", action="store_true", help="Sign in by scanning a QR code with Telegram mobile app")
    p.add_argument("--chat", default="", help="Comma-separated Telegram group names")
    args = p.parse_args()
    if not (args.scan or args.incremental or args.download):
        args.scan = True
    asyncio.run(run_sync(args))


if __name__ == "__main__":
    main()
