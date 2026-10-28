// Parser puro del texto libre de Quick Add ("almuerzo 18.500 efectivo ayer
// #trabajo") → importe, tipo, cuenta, fecha, etiquetas y el resto como
// descripción. Sin React ni fetch: testeado en tests/unit/quick-add-parse.test.ts.
import { currencyFractionDigits } from "@/lib/format";

export type QuickAddType = "INCOME" | "EXPENSE";

export interface ParseAccount {
  id: string;
  name: string;
  type?: string;
}

export interface ParseContext {
  /** Moneda con la que se interpretan los separadores (COP: el punto es de miles). */
  currency: string;
  /** Hoy en la zona horaria del usuario, yyyy-mm-dd. */
  today: string;
  accounts?: ParseAccount[];
  /**
   * Comercios conocidos (nombres de payee y comercios de reglas). Si las
   * primeras palabras de la descripción coinciden con uno, se rellena `payee`.
   */
  merchants?: string[];
}

export interface ParsedQuickAdd {
  /** Importe positivo como string decimal ("18500", "3.5"); null si no hay. */
  amount: string | null;
  /** INCOME por "+" o palabras como "nómina"; EXPENSE por "-"; null = sin pista. */
  type: QuickAddType | null;
  /** Texto que identificó la cuenta ("tarjeta nu"), tal como se escribió. */
  accountAlias: string | null;
  accountId: string | null;
  /** yyyy-mm-dd; null = no se mencionó fecha. */
  date: string | null;
  tags: string[];
  /** Comercio conocido con el que empieza la descripción ("Rappi"), con su nombre de display; null si no hay. */
  payee: string | null;
  /** Lo que queda (descripción / comercio), con la primera letra en mayúscula. */
  description: string;
}

/** Minúsculas sin tildes ni puntuación de borde: "Nómina," → "nomina". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}+$#-]+|[^\p{L}\p{N}%]+$/gu, "");
}

// ─── Importes ───────────────────────────────────────────────────────────────

const MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  mil: 1e3,
  luca: 1e3,
  lucas: 1e3,
  m: 1e6,
  mm: 1e6,
  millon: 1e6,
  millones: 1e6,
  palo: 1e6,
  palos: 1e6,
};

// Grupos de miles ("4.500.000", "18,500") o dígitos seguidos; decimales de 1–2
// cifras tras coma o punto; multiplicador pegado opcional ("18,5k", "1,2M").
const AMOUNT_RE = /^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?([a-z]+)?$/;

interface AmountMatch {
  value: number;
  /** Tenía "$", "+"/"-" o multiplicador: pista fuerte de que es el importe. */
  explicit: boolean;
  sign: "+" | "-" | null;
}

/**
 * Interpreta un importe escrito a mano. `currency` decide si una coma o punto
 * seguido de 1–2 cifras es decimal (monedas con centavos) o se redondea (COP);
 * con multiplicador ("18,5k") siempre es decimal. Devuelve null si no es un importe.
 */
export function parseAmountText(raw: string, currency: string, nextWord?: string): AmountMatch | null {
  let text = raw.trim().replace(/\s+/g, "");
  let sign: AmountMatch["sign"] = null;
  if (text.startsWith("+") || text.startsWith("-") || text.startsWith("−")) {
    sign = text.startsWith("+") ? "+" : "-";
    text = text.slice(1);
  }
  let explicit = sign !== null;
  if (text.startsWith("$")) {
    text = text.slice(1);
    explicit = true;
  }
  const match = AMOUNT_RE.exec(text.toLowerCase());
  if (!match) return null;
  const [, intPart, decPart, attachedSuffix] = match;
  let multiplier = 1;
  if (attachedSuffix) {
    multiplier = MULTIPLIERS[attachedSuffix] ?? 0;
    if (!multiplier) return null; // "d1", "3x"… no son importes
    explicit = true;
  } else if (nextWord && MULTIPLIERS[fold(nextWord)] && fold(nextWord).length > 1) {
    // "1.2 millones", "18 mil" (una "m" suelta no cuenta: puede ser texto)
    multiplier = MULTIPLIERS[fold(nextWord)];
    explicit = true;
  }
  const integer = intPart.replace(/[.,]/g, "");
  let value = Number(decPart ? `${integer}.${decPart}` : integer) * multiplier;
  if (!Number.isFinite(value) || value <= 0) return null;
  const digits = currencyFractionDigits(currency);
  const factor = 10 ** digits;
  value = Math.round(value * factor) / factor;
  if (value <= 0) return null;
  return { value, explicit, sign };
}

/** Número → string decimal sin ceros de relleno ("18500", "3.5"). */
export function amountToString(value: number, currency: string): string {
  return String(Number(value.toFixed(currencyFractionDigits(currency))));
}

// ─── Fechas ─────────────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

function validDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return toIso(d);
}

/** "15/10", "15/10/26", "2026-10-15" → yyyy-mm-dd (sin año: el último 15/10 que no sea futuro). */
function parseNumericDate(token: string, today: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dm = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(token);
  if (!dm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]);
  if (dm[3]) {
    const year = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
    return validDate(year, month, day);
  }
  const year = Number(today.slice(0, 4));
  const candidate = validDate(year, month, day);
  if (!candidate) return null;
  return candidate > today ? validDate(year - 1, month, day) : candidate;
}

// ─── Cuentas ────────────────────────────────────────────────────────────────

/** Palabras que no identifican una cuenta por sí solas. */
const GENERIC_WORDS = new Set(["cuenta", "ahorros", "ahorro", "corriente", "de", "del", "la", "el", "mi", "tarjeta", "credito"]);

const TYPE_ALIASES: Record<string, string[]> = {
  CASH: ["efectivo", "cash", "plata"],
  CREDIT_CARD: ["tarjeta", "tc", "tarjeta de credito", "credito"],
};

interface Alias {
  words: string[];
  accountId: string;
  /** Menor = preferido ante empates (nombre completo > inicio del nombre > palabra suelta > tipo). */
  rank: number;
}

function buildAliases(accounts: ParseAccount[]): Alias[] {
  const aliases: Alias[] = [];
  for (const account of accounts) {
    const words = account.name.split(/\s+/).map(fold).filter(Boolean);
    if (words.length === 0) continue;
    aliases.push({ words, accountId: account.id, rank: 0 });
    words.forEach((word, i) => {
      if (!GENERIC_WORDS.has(word) && word.length > 1) aliases.push({ words: [word], accountId: account.id, rank: i === 0 ? 1 : 2 });
    });
    for (const alias of TYPE_ALIASES[account.type ?? ""] ?? []) {
      aliases.push({ words: alias.split(" "), accountId: account.id, rank: 3 });
    }
  }
  return aliases;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

const INCOME_WORDS = new Set(["nomina", "ingreso", "salario", "sueldo", "quincena", "prima", "honorarios", "reembolso"]);
const PREPOSITIONS = new Set(["con", "en", "desde", "por", "de", "el"]);

interface Token {
  raw: string;
  folded: string;
  used: boolean;
}

export function parseQuickAdd(input: string, ctx: ParseContext): ParsedQuickAdd {
  // "$ 45.000" y "+ 4.500.000" → un solo token.
  const normalized = input.replace(/([$+])\s+(?=\d)/g, "$1").replace(/\+\$\s*/g, "+$");
  const tokens: Token[] = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, folded: fold(raw), used: false }));

  const result: ParsedQuickAdd = {
    amount: null,
    type: null,
    accountAlias: null,
    accountId: null,
    date: null,
    tags: [],
    payee: null,
    description: "",
  };

  // Etiquetas
  for (const t of tokens) {
    const tag = /^#([\p{L}\p{N}_-]+)$/u.exec(t.raw.replace(/[.,;]+$/, ""));
    if (tag) {
      t.used = true;
      if (!result.tags.includes(tag[1])) result.tags.push(tag[1]);
    }
  }

  // Fechas (la primera mención gana)
  for (let i = 0; i < tokens.length && !result.date; i++) {
    const t = tokens[i];
    if (t.used) continue;
    let date: string | null = null;
    let span = 1;
    if (t.folded === "hoy") date = ctx.today;
    else if (t.folded === "ayer") date = addDays(ctx.today, -1);
    else if (t.folded === "anteayer" || t.folded === "antier") date = addDays(ctx.today, -2);
    else if (t.folded === "antes" && tokens[i + 1]?.folded === "de" && tokens[i + 2]?.folded === "ayer") {
      date = addDays(ctx.today, -2);
      span = 3;
    } else if (t.folded in WEEKDAYS) {
      const strict = tokens[i + 1]?.folded === "pasado";
      const todayDow = toUtc(ctx.today).getUTCDay();
      let back = (todayDow - WEEKDAYS[t.folded] + 7) % 7;
      if (strict && back === 0) back = 7;
      date = addDays(ctx.today, -back);
      if (strict) span = 2;
    } else {
      date = parseNumericDate(t.raw.replace(/[.,;]+$/, ""), ctx.today);
    }
    if (date) {
      result.date = date;
      for (let j = 0; j < span; j++) tokens[i + j].used = true;
      const prev = tokens[i - 1];
      if (prev && !prev.used && prev.folded === "el") prev.used = true;
    }
  }

  // Importe: preferir uno marcado ($, +, multiplicador); si no, el último número.
  const candidates: { index: number; match: AmountMatch; usesNext: boolean }[] = [];
  tokens.forEach((t, i) => {
    if (t.used) return;
    const next = tokens[i + 1];
    const nextWord = next && !next.used ? next.raw : undefined;
    const match = parseAmountText(t.raw.replace(/[;]+$/, ""), ctx.currency, nextWord);
    if (!match) return;
    const attached = /[a-z]$/i.test(t.raw);
    const usesNext = !attached && !!nextWord && fold(nextWord).length > 1 && !!MULTIPLIERS[fold(nextWord)];
    candidates.push({ index: i, match, usesNext });
  });
  const chosen = candidates.filter((c) => c.match.explicit).at(0) ?? candidates.at(-1);
  if (chosen) {
    result.amount = amountToString(chosen.match.value, ctx.currency);
    tokens[chosen.index].used = true;
    if (chosen.usesNext) tokens[chosen.index + 1].used = true;
    if (chosen.match.sign) result.type = chosen.match.sign === "+" ? "INCOME" : "EXPENSE";
  }

  // Cuenta: n-gramas más largos primero; empate → rank menor, luego primera cuenta.
  const aliases = buildAliases(ctx.accounts ?? []);
  let best: { start: number; length: number; alias: Alias } | null = null;
  for (let start = 0; start < tokens.length; start++) {
    for (const alias of aliases) {
      const n = alias.words.length;
      const slice = tokens.slice(start, start + n);
      if (slice.length !== n || slice.some((t) => t.used)) continue;
      if (!slice.every((t, k) => t.folded === alias.words[k])) continue;
      if (!best || n > best.length || (n === best.length && alias.rank < best.alias.rank)) {
        best = { start, length: n, alias };
      }
    }
  }
  if (best) {
    const slice = tokens.slice(best.start, best.start + best.length);
    result.accountId = best.alias.accountId;
    result.accountAlias = slice.map((t) => t.raw).join(" ");
    slice.forEach((t) => (t.used = true));
    const prev = tokens[best.start - 1];
    if (prev && !prev.used && PREPOSITIONS.has(prev.folded) && best.start - 1 > 0) prev.used = true;
  }

  // Tipo por palabras clave (se quedan en la descripción: "Nómina").
  if (!result.type && tokens.some((t) => !t.used && INCOME_WORDS.has(t.folded))) result.type = "INCOME";

  const rest = tokens
    .filter((t) => !t.used)
    .map((t) => t.raw)
    .join(" ")
    .replace(/\s+[,;.]+(?=\s|$)/g, "")
    .trim();
  result.description = rest ? rest.charAt(0).toLocaleUpperCase("es") + rest.slice(1) : "";
  result.payee = leadingMerchant(
    tokens.filter((t) => !t.used),
    ctx.merchants ?? [],
  );
  return result;
}

/** Palabras plegadas de un nombre de comercio ("Juan Valdez" → ["juan", "valdez"]). */
const merchantWords = (name: string) => name.split(/\s+/).map(fold).filter(Boolean);

/**
 * Comercio conocido con el que empiezan las palabras restantes; gana el de más
 * palabras y, a igualdad, el primero de la lista (los payees van antes que los
 * comercios de reglas).
 */
function leadingMerchant(rest: Token[], merchants: string[]): string | null {
  let best: { name: string; length: number } | null = null;
  for (const name of merchants) {
    const words = merchantWords(name);
    if (words.length === 0 || words.length > rest.length) continue;
    if (!words.every((w, i) => rest[i].folded === w)) continue;
    if (!best || words.length > best.length) best = { name: name.trim(), length: words.length };
  }
  return best?.name ?? null;
}
