import hongKongI from "./assets/ratings/hong-kong/i.svg";
import hongKongII from "./assets/ratings/hong-kong/ii.svg";
import hongKongIIA from "./assets/ratings/hong-kong/iia.svg";
import hongKongIIB from "./assets/ratings/hong-kong/iib.svg";
import hongKongIII from "./assets/ratings/hong-kong/iii.svg";
import japanG from "./assets/ratings/japan/g.svg";
import japanPG12 from "./assets/ratings/japan/pg12.svg";
import japanR15Plus from "./assets/ratings/japan/r15-plus.svg";
import japanR18Plus from "./assets/ratings/japan/r18-plus.svg";
import korea12 from "./assets/ratings/korea/12.svg";
import korea15 from "./assets/ratings/korea/15.svg";
import korea19 from "./assets/ratings/korea/19.svg";
import koreaAll from "./assets/ratings/korea/all.svg";
import taiwan0Plus from "./assets/ratings/taiwan/0-plus.svg";
import taiwan12Plus from "./assets/ratings/taiwan/12-plus.svg";
import taiwan15Plus from "./assets/ratings/taiwan/15-plus.svg";
import taiwan18Plus from "./assets/ratings/taiwan/18-plus.svg";
import taiwan6Plus from "./assets/ratings/taiwan/6-plus.svg";
import westernG from "./assets/ratings/western/g.svg";
import westernNC17 from "./assets/ratings/western/nc-17.svg";
import westernPG13 from "./assets/ratings/western/pg-13.svg";
import westernPG from "./assets/ratings/western/pg.svg";
import westernR from "./assets/ratings/western/r.svg";

const WESTERN_BADGES = {
  G: westernG,
  PG: westernPG,
  "PG-13": westernPG13,
  R: westernR,
  "NC-17": westernNC17
};

const JAPAN_BADGES = {
  G: japanG,
  PG12: japanPG12,
  "R15+": japanR15Plus,
  "R18+": japanR18Plus
};

const KOREA_BADGES = {
  ALL: koreaAll,
  12: korea12,
  15: korea15,
  19: korea19
};

const HONG_KONG_BADGES = {
  I: hongKongI,
  II: hongKongII,
  IIA: hongKongIIA,
  IIB: hongKongIIB,
  III: hongKongIII
};

const TAIWAN_BADGES = {
  "0+": taiwan0Plus,
  "6+": taiwan6Plus,
  "12+": taiwan12Plus,
  "15+": taiwan15Plus,
  "18+": taiwan18Plus
};

const DIRECT_BADGES = {
  PG: { src: westernPG, group: "western" },
  "PG-13": { src: westernPG13, group: "western" },
  R: { src: westernR, group: "western" },
  "NC-17": { src: westernNC17, group: "western" },
  PG12: { src: japanPG12, group: "japan" },
  "R15+": { src: japanR15Plus, group: "japan" },
  "R18+": { src: japanR18Plus, group: "japan" },
  ALL: { src: koreaAll, group: "korea" },
  12: { src: korea12, group: "korea" },
  15: { src: korea15, group: "korea" },
  19: { src: korea19, group: "korea" },
  I: { src: hongKongI, group: "hong-kong" },
  II: { src: hongKongII, group: "hong-kong" },
  IIA: { src: hongKongIIA, group: "hong-kong" },
  IIB: { src: hongKongIIB, group: "hong-kong" },
  III: { src: hongKongIII, group: "hong-kong" },
  "0+": { src: taiwan0Plus, group: "taiwan" },
  "6+": { src: taiwan6Plus, group: "taiwan" },
  "12+": { src: taiwan12Plus, group: "taiwan" },
  "15+": { src: taiwan15Plus, group: "taiwan" },
  "18+": { src: taiwan18Plus, group: "taiwan" }
};

export function resolveCertificationBadge(movie) {
  const code = normalizeCertification(movie?.certification);
  if (!code) return null;

  return code === "G" ? resolveGBadge(movie?.country) : directBadge(code);
}

function badgeFrom(badges, code, group) {
  const src = badges[code];
  return src ? { src, code, group } : null;
}

function directBadge(code) {
  const badge = DIRECT_BADGES[code];
  return badge ? { ...badge, code } : null;
}

function resolveGBadge(country) {
  const value = String(country || "");
  const japanIndex = value.indexOf("日本");
  const unitedStatesIndex = value.indexOf("美国");
  const hasJapan = japanIndex !== -1;
  const hasUnitedStates = unitedStatesIndex !== -1;

  if (hasJapan && !hasUnitedStates) return badgeFrom(JAPAN_BADGES, "G", "japan");
  if (hasUnitedStates && !hasJapan) return badgeFrom(WESTERN_BADGES, "G", "western");
  if (hasJapan && hasUnitedStates) {
    return japanIndex < unitedStatesIndex
      ? badgeFrom(JAPAN_BADGES, "G", "japan")
      : badgeFrom(WESTERN_BADGES, "G", "western");
  }

  return badgeFrom(WESTERN_BADGES, "G", "western");
}

function normalizeCertification(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[＋﹢]/g, "+")
    .replace(/[‐‑‒–—−－]/g, "-")
    .toUpperCase();
  if (!raw) return "";

  const compact = raw.replace(/\s+/g, "");

  if (/NC-?17/.test(compact)) return "NC-17";
  if (/PG-?13/.test(compact)) return "PG-13";
  if (/PG-?12/.test(compact)) return "PG12";
  if (/R15\+?/.test(compact)) return "R15+";
  if (/R18\+?/.test(compact)) return "R18+";

  const exact = compact.replace(/^[A-Z]+:/, "");
  if (exact === "G") return "G";
  if (exact === "PG") return "PG";
  if (exact === "R") return "R";
  if (exact === "ALL") return "ALL";
  if (["12", "15", "19"].includes(exact)) return exact;
  if (["0+", "6+", "12+", "15+", "18+"].includes(exact)) return exact;
  if (["I", "II", "IIA", "IIB", "III"].includes(exact)) return exact;

  const tokenized = raw.replace(/[^A-Z0-9+]+/g, " ");
  if (/\bG\b/.test(tokenized)) return "G";
  if (/\bPG\b/.test(tokenized)) return "PG";
  if (/\bR\b/.test(tokenized)) return "R";
  if (/\bALL\b/.test(tokenized)) return "ALL";

  return "";
}
