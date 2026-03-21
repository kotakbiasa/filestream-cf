// ---------- Insert Your Data ---------- //

const BOT_TOKEN = "BOT_TOKEN"; // Insert your bot token.
const BOT_WEBHOOK = "/endpoint"; // Let it be as it is.
const BOT_SECRET = "BOT_SECRET"; // Insert a powerful secret text (only [A-Z, a-z, 0-9, _, -] are allowed).
const BOT_OWNER = 123456789; // Insert your telegram account id.
const BOT_CHANNEL = -100123456789; // Insert your telegram channel id which the bot is admin in.
const SIA_SECRET = "SIA_SECRET"; // Insert a powerful secret text and keep it safe.
const PUBLIC_BOT = false; // Make your bot public (only [true, false] are allowed).

// ---------- Do Not Modify ---------- //

const WHITE_METHODS = ["GET", "POST", "HEAD", "OPTIONS"];
const HEADERS_FILE = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const HEADERS_ERRR = { "Access-Control-Allow-Origin": "*", "content-type": "application/json" };
const ERROR_404 = { ok: false, error_code: 404, description: "Bad Request: missing /?file= parameter", credit: "https://github.com/vauth/filestream-cf" };
const ERROR_405 = { ok: false, error_code: 405, description: "Bad Request: method not allowed" };
const ERROR_406 = { ok: false, error_code: 406, description: "Bad Request: file type invalid" };
const ERROR_407 = { ok: false, error_code: 407, description: "Bad Request: file hash invalid by atob" };
const ERROR_408 = { ok: false, error_code: 408, description: "Bad Request: mode not in [attachment, inline]" };
const SOURCE_BUTTON = [[{ text: "Source Code", url: "https://github.com/vauth/filestream-cf" }]];

// ---------- Event Listener ---------- //

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const { request } = event;
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === BOT_WEBHOOK) return Bot.handleWebhook(event);
  if (pathname === "/registerWebhook") return Bot.registerWebhook(url, BOT_WEBHOOK, BOT_SECRET);
  if (pathname === "/unregisterWebhook") return Bot.unregisterWebhook();
  if (pathname === "/getMe") return new Response(JSON.stringify(await Bot.getMe()), { headers: HEADERS_ERRR, status: 202 });

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: HEADERS_FILE, status: 204 });
  }

  const file = url.searchParams.get("file");
  const mode = url.searchParams.get("mode") || "attachment";

  if (!file) return Raise(ERROR_404, 404);
  if (!["attachment", "inline"].includes(mode)) return Raise(ERROR_408, 404);
  if (!WHITE_METHODS.includes(request.method)) return Raise(ERROR_405, 405);

  const decodedFileId = await decodeHashOrNull(file);
  if (!decodedFileId) return Raise(ERROR_407, 404);

  const retrieve = await RetrieveFile(BOT_CHANNEL, decodedFileId);
  if (retrieve.error_code) return Raise(retrieve, retrieve.error_code);

  const [rdata, rname, rsize, rtype] = retrieve;
  return new Response(rdata, {
    status: 200,
    headers: {
      "Content-Disposition": `${mode}; filename="${encodeFileName(rname)}"`,
      "Content-Length": String(rsize),
      "Content-Type": rtype,
      ...HEADERS_FILE,
    },
  });
}

// ---------- Retrieve File ---------- //

function extractFileMeta(data) {
  if (data.document) {
    return {
      id: data.document.file_id,
      name: data.document.file_name,
      type: data.document.mime_type,
      size: data.document.file_size,
      inlineType: "document",
    };
  }

  if (data.audio) {
    return {
      id: data.audio.file_id,
      name: data.audio.file_name,
      type: data.audio.mime_type,
      size: data.audio.file_size,
      inlineType: "document",
    };
  }

  if (data.video) {
    return {
      id: data.video.file_id,
      name: data.video.file_name,
      type: data.video.mime_type,
      size: data.video.file_size,
      inlineType: "document",
    };
  }

  if (data.photo) {
    const photo = data.photo[data.photo.length - 1];
    return {
      id: photo.file_id,
      name: `${photo.file_unique_id}.jpg`,
      type: "image/jpg",
      size: photo.file_size,
      inlineType: "photo",
    };
  }

  return null;
}

async function RetrieveFile(channel_id, message_id) {
  const data = await Bot.editMessage(channel_id, message_id, UUID());
  if (data.error_code) return data;

  const fileMeta = extractFileMeta(data);
  if (!fileMeta) return ERROR_406;

  const file = await Bot.getFile(fileMeta.id);
  if (file.error_code) return file;

  return [await Bot.fetchFile(file.file_path), fileMeta.name, fileMeta.size, fileMeta.type];
}

// ---------- Raise Error ---------- //

function Raise(json_error, status_code) {
  return new Response(JSON.stringify(json_error), { headers: HEADERS_ERRR, status: status_code });
}

// ---------- UUID Generator ---------- //

function UUID() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function encodeFileName(name = "file") {
  return String(name).replace(/[\r\n"]/g, "_");
}

async function decodeHashOrNull(value) {
  try {
    return await Cryptic.deHash(String(value).trim().toUpperCase());
  } catch {
    return null;
  }
}

// ---------- Hash Generator ---------- //

class Cryptic {
  static async getSalt(length = 16) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(length));

    return Array.from(bytes, (byte) => characters[byte % characters.length]).join("");
  }

  static async getKey(salt, iterations = 1000, keyLength = 32) {
    const key = new Uint8Array(keyLength);

    for (let i = 0; i < keyLength; i++) {
      key[i] = (SIA_SECRET.charCodeAt(i % SIA_SECRET.length) + salt.charCodeAt(i % salt.length)) % 256;
    }

    for (let j = 0; j < iterations; j++) {
      for (let i = 0; i < keyLength; i++) {
        key[i] = (key[i] + SIA_SECRET.charCodeAt(i % SIA_SECRET.length) + salt.charCodeAt(i % salt.length)) % 256;
      }
    }

    return key;
  }

  static async baseEncode(input) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let output = "";
    let buffer = 0;
    let bitsLeft = 0;

    for (let i = 0; i < input.length; i++) {
      buffer = (buffer << 8) | input.charCodeAt(i);
      bitsLeft += 8;

      while (bitsLeft >= 5) {
        output += alphabet[(buffer >> (bitsLeft - 5)) & 31];
        bitsLeft -= 5;
      }
    }

    if (bitsLeft > 0) {
      output += alphabet[(buffer << (5 - bitsLeft)) & 31];
    }

    return output;
  }

  static async baseDecode(input) {
    const normalizedInput = String(input).replace(/=+$/g, "");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const lookup = {};

    for (let i = 0; i < alphabet.length; i++) {
      lookup[alphabet[i]] = i;
    }

    let buffer = 0;
    let bitsLeft = 0;
    let output = "";

    for (let i = 0; i < normalizedInput.length; i++) {
      if (!(normalizedInput[i] in lookup)) {
        throw new Error("Invalid base32 input");
      }

      buffer = (buffer << 5) | lookup[normalizedInput[i]];
      bitsLeft += 5;

      if (bitsLeft >= 8) {
        output += String.fromCharCode((buffer >> (bitsLeft - 8)) & 255);
        bitsLeft -= 8;
      }
    }

    return output;
  }

  static async Hash(text) {
    const salt = await this.getSalt();
    const key = await this.getKey(salt);
    const encoded = String(text)
      .split("")
      .map((char, index) => String.fromCharCode(char.charCodeAt(0) ^ key[index % key.length]))
      .join("");

    return this.baseEncode(salt + encoded);
  }

  static async deHash(hashed) {
    const decoded = await this.baseDecode(hashed);
    const salt = decoded.substring(0, 16);
    const encoded = decoded.substring(16);
    const key = await this.getKey(salt);

    return encoded
      .split("")
      .map((char, index) => String.fromCharCode(char.charCodeAt(0) ^ key[index % key.length]))
      .join("");
  }
}

// ---------- Telegram Bot ---------- //

class Bot {
  static async handleWebhook(event) {
    if (event.request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== BOT_SECRET) {
      return new Response("Unauthorized", { status: 403 });
    }

    const update = await event.request.json();
    event.waitUntil(this.Update(event, update));
    return new Response("Ok");
  }

  static async registerWebhook(requestUrl, suffix, secret) {
    const webhookUrl = `${requestUrl.protocol}//${requestUrl.host}${suffix}`;
    const response = await fetch(await this.apiUrl("setWebhook", { url: webhookUrl, secret_token: secret }));
    return new Response(JSON.stringify(await response.json()), { headers: HEADERS_ERRR });
  }

  static async unregisterWebhook() {
    const response = await fetch(await this.apiUrl("setWebhook", { url: "" }));
    return new Response(JSON.stringify(await response.json()), { headers: HEADERS_ERRR });
  }

  static async getMe() {
    const response = await fetch(await this.apiUrl("getMe"));
    if (response.status === 200) return (await response.json()).result;
    return response.json();
  }

  static async sendMessage(chat_id, reply_id, text, reply_markup = []) {
    const response = await fetch(
      await this.apiUrl("sendMessage", {
        chat_id,
        reply_to_message_id: reply_id,
        parse_mode: "markdown",
        text,
        reply_markup: JSON.stringify({ inline_keyboard: reply_markup }),
      }),
    );

    if (response.status === 200) return (await response.json()).result;
    return response.json();
  }

  static async sendDocument(chat_id, file_id) {
    const response = await fetch(await this.apiUrl("sendDocument", { chat_id, document: file_id }));
    if (response.status === 200) return (await response.json()).result;
    return response.json();
  }

  static async sendPhoto(chat_id, file_id) {
    const response = await fetch(await this.apiUrl("sendPhoto", { chat_id, photo: file_id }));
    if (response.status === 200) return (await response.json()).result;
    return response.json();
  }

  static async editMessage(channel_id, message_id, caption_text) {
    const response = await fetch(
      await this.apiUrl("editMessageCaption", { chat_id: channel_id, message_id, caption: caption_text }),
    );
    if (response.status === 200) return (await response.json()).result;
    return response.json();
  }

  static async answerInlineArticle(query_id, title, description, text, reply_markup = [], id = "1") {
    const data = [
      {
        type: "article",
        id,
        title,
        thumbnail_url: "https://i.ibb.co/5s8hhND/dac5fa134448.png",
        description,
        input_message_content: { message_text: text, parse_mode: "markdown" },
        reply_markup: { inline_keyboard: reply_markup },
      },
    ];
    const response = await fetch(
      await this.apiUrl("answerInlineQuery", { inline_query_id: query_id, results: JSON.stringify(data), cache_time: 1 }),
    );
    if (response.status === 200) return (await response.json()).result;
    return response.json();
  }

  static async answerInlineDocument(query_id, title, file_id, mime_type, reply_markup = [], id = "1") {
    const data = [
      {
        type: "document",
        id,
        title,
        document_file_id: file_id,
        mime_type,
        description: mime_type,
        reply_markup: { inline_keyboard: reply_markup },
      },
    ];

    const response = await fetch(
      await this.apiUrl("answerInlineQuery", { inline_query_id: query_id, results: JSON.stringify(data), cache_time: 1 }),
    );

    if (response.status === 200) return (await response.json()).result;
    return response.json();
  }

  static async answerInlinePhoto(query_id, title, photo_id, reply_markup = [], id = "1") {
    const data = [{ type: "photo", id, title, photo_file_id: photo_id, reply_markup: { inline_keyboard: reply_markup } }];
    const response = await fetch(
      await this.apiUrl("answerInlineQuery", { inline_query_id: query_id, results: JSON.stringify(data), cache_time: 1 }),
    );
    if (response.status === 200) return (await response.json()).result;
    return response.json();
  }

  static async getFile(file_id) {
    const response = await fetch(await this.apiUrl("getFile", { file_id }));
    if (response.status === 200) return (await response.json()).result;
    return response.json();
  }

  static async fetchFile(file_path) {
    const file = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file_path}`);
    return file.arrayBuffer();
  }

  static async apiUrl(methodName, params = null) {
    let query = "";
    if (params) query = `?${new URLSearchParams(params).toString()}`;
    return `https://api.telegram.org/bot${BOT_TOKEN}/${methodName}${query}`;
  }

  static async Update(event, update) {
    if (update.inline_query) await onInline(update.inline_query);
    if ("message" in update) await onMessage(event, update.message);
  }
}

// ---------- Inline Listener ---------- //

async function onInline(inline) {
  if (!PUBLIC_BOT && inline.from.id !== BOT_OWNER) {
    return Bot.answerInlineArticle(
      inline.id,
      "Access forbidden",
      "Deploy your own filestream-cf.",
      "*❌ Access forbidden.*\n📡 Deploy your own [filestream-cf](https://github.com/vauth/filestream-cf) bot.",
      SOURCE_BUTTON,
    );
  }

  const messageId = await decodeHashOrNull(inline.query);
  if (!messageId) {
    return Bot.answerInlineArticle(inline.id, "Error", ERROR_407.description, ERROR_407.description, SOURCE_BUTTON);
  }

  const data = await Bot.editMessage(BOT_CHANNEL, messageId, UUID());
  if (data.error_code) {
    return Bot.answerInlineArticle(inline.id, "Error", data.description, data.description, SOURCE_BUTTON);
  }

  const fileMeta = extractFileMeta(data);
  if (!fileMeta) {
    return Bot.answerInlineArticle(inline.id, "Error", ERROR_406.description, ERROR_406.description, SOURCE_BUTTON);
  }

  const buttons = [[{ text: "Send Again", switch_inline_query_current_chat: inline.query }]];

  if (fileMeta.inlineType === "photo") {
    return Bot.answerInlinePhoto(inline.id, fileMeta.name || "undefined", fileMeta.id, buttons);
  }

  return Bot.answerInlineDocument(inline.id, fileMeta.name || "undefined", fileMeta.id, fileMeta.type, buttons);
}

// ---------- Message Listener ---------- //

async function onMessage(event, message) {
  let fID;
  let fName;
  let fSave;

  const url = new URL(event.request.url);
  const bot = await Bot.getMe();

  if (message.via_bot && message.via_bot.username === bot.username) {
    return;
  }

  if (String(message.chat.id).includes("-100")) {
    return;
  }

  if (message.text && message.text.startsWith("/start ")) {
    const fileHash = message.text.split("/start ")[1];
    const messageId = await decodeHashOrNull(fileHash);
    if (!messageId) {
      return Bot.sendMessage(message.chat.id, message.message_id, ERROR_407.description);
    }

    const data = await Bot.editMessage(BOT_CHANNEL, messageId, UUID());
    if (data.error_code) {
      return Bot.sendMessage(message.chat.id, message.message_id, data.description);
    }

    const fileMeta = extractFileMeta(data);
    if (!fileMeta) {
      return Bot.sendMessage(message.chat.id, message.message_id, "Bad Request: File not found");
    }

    if (fileMeta.inlineType === "photo") {
      return Bot.sendPhoto(message.chat.id, fileMeta.id);
    }

    return Bot.sendDocument(message.chat.id, fileMeta.id);
  }

  if (!PUBLIC_BOT && message.chat.id !== BOT_OWNER) {
    return Bot.sendMessage(
      message.chat.id,
      message.message_id,
      "*❌ Access forbidden.*\n📡 Deploy your own [filestream-cf](https://github.com/vauth/filestream-cf) bot.",
      SOURCE_BUTTON,
    );
  }

  if (message.document) {
    fID = message.document.file_id;
    fName = message.document.file_name;
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID);
  } else if (message.audio) {
    fID = message.audio.file_id;
    fName = message.audio.file_name;
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID);
  } else if (message.video) {
    fID = message.video.file_id;
    fName = message.video.file_name;
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID);
  } else if (message.photo) {
    fID = message.photo[message.photo.length - 1].file_id;
    fName = `${message.photo[message.photo.length - 1].file_unique_id}.jpg`;
    fSave = await Bot.sendPhoto(BOT_CHANNEL, fID);
  } else {
    return Bot.sendMessage(
      message.chat.id,
      message.message_id,
      "Send me any file/video/gif/audio *(t<=4GB, e<=20MB)*.",
      SOURCE_BUTTON,
    );
  }

  if (fSave.error_code) {
    return Bot.sendMessage(message.chat.id, message.message_id, fSave.description);
  }

  const final_hash = await Cryptic.Hash(fSave.message_id);
  const final_link = `${url.origin}/?file=${final_hash}`;
  const final_stre = `${url.origin}/?file=${final_hash}&mode=inline`;
  const final_tele = `https://t.me/${bot.username}/?start=${final_hash}`;

  const buttons = [
    [
      { text: "Telegram Link", url: final_tele },
      { text: "Inline Link", switch_inline_query: final_hash },
    ],
    [
      { text: "Stream Link", url: final_stre },
      { text: "Download Link", url: final_link },
    ],
  ];

  const final_text = `*🗂 File Name:* \`${fName}\`\n*⚙️ File Hash:* \`${final_hash}\``;
  return Bot.sendMessage(message.chat.id, message.message_id, final_text, buttons);
}
