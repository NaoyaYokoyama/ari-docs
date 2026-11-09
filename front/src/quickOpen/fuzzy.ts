// あいまい検索（探して開く。FN0003）。打った文字が順に含まれていれば一致とし（fzf と同じ考え方）、
// 名前（パスの最後・タイトル）での一致・単語の始まり・続いた文字を高くする。
// サーバー（back/src/search/fuzzy.rs）と同じ点数の付け方で、画面に出すものをまとめて並べ直す

// 点数（fzf と同じ大きさ）。名前の中での一致と、名前の始まりからの一致を足す
const MATCH = 16;
const BOUNDARY = 8;
const CONSECUTIVE = 4;
const GAP_START = 3;
const GAP_EXTENSION = 1;
const NAME = 40;
const PREFIX = 16;

// 単語の区切りとみなす文字（この次の文字を単語の始まりとする）
const SEPARATORS = new Set(["/", " ", "_", "-", ".", "(", ")", "[", "]", "【", "】", "「", "」", "・"]);

type Folded = {
  chars: string[];
  // そろえたあとの文字が、元の何文字目（から何文字目まで）か。一致した文字を太字にするため
  origin: [number, number][];
};

// カタカナ（ァ〜ヶ）をひらがなにする
function foldKana(char: string) {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
}

// 全角・半角、大文字・小文字、カタカナ・ひらがなの違いをそろえる。
// 1 文字ずつそろえる（半角カナの濁点・半濁点は前の文字と合わせる。ｶﾞ → が）
function fold(text: string): Folded {
  const source = [...text];
  const chars: string[] = [];
  const origin: [number, number][] = [];
  for (let index = 0; index < source.length; index++) {
    const combined = source[index + 1] === "ﾞ" || source[index + 1] === "ﾟ";
    const unit = combined ? source[index] + source[index + 1] : source[index];
    for (const char of unit.normalize("NFKC").toLowerCase()) {
      chars.push(foldKana(char));
      origin.push([index, combined ? index + 1 : index]);
    }
    if (combined) {
      index++;
    }
  }
  return { chars, origin };
}

export type Query = string[][];

// 空白で区切った語。語が無ければ null
export function parseQuery(keyword: string): Query | null {
  const terms = fold(keyword)
    .chars.join("")
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => [...term]);
  return terms.length > 0 ? terms : null;
}

// term の文字が from 以降に順に含まれる位置。なるべく短い範囲にする（前から探して終わりを決め、後ろから始まりを詰める）
function find(target: string[], term: string[], from: number) {
  let index = 0;
  let end = -1;
  for (let position = from; position < target.length; position++) {
    if (target[position] === term[index]) {
      index++;
      if (index === term.length) {
        end = position;
        break;
      }
    }
  }
  if (end === -1) {
    return null;
  }
  let start = end;
  index = term.length;
  for (let position = end; position >= from; position--) {
    if (target[position] === term[index - 1]) {
      index--;
      if (index === 0) {
        start = position;
        break;
      }
    }
  }
  const positions: number[] = [];
  for (let position = start; position <= end && positions.length < term.length; position++) {
    if (target[position] === term[positions.length]) {
      positions.push(position);
    }
  }
  return positions;
}

const isWord = (char: string) => /^[0-9a-z]$/.test(char);

function isBoundary(target: string[], position: number, nameStart: number) {
  if (position === 0 || position === nameStart) {
    return true;
  }
  const previous = target[position - 1];
  return SEPARATORS.has(previous) || isWord(previous) !== isWord(target[position]);
}

function termScore(target: string[], positions: number[], nameStart: number) {
  let score = 0;
  // 続いた文字は、続きの始まりの文字の点数（単語の始まりなど）を引き継ぐ
  let chunk = 0;
  positions.forEach((position, index) => {
    const boundary = isBoundary(target, position, nameStart) ? BOUNDARY : 0;
    let bonus: number;
    if (index > 0 && position === positions[index - 1] + 1) {
      bonus = Math.max(boundary, chunk, CONSECUTIVE);
    } else {
      if (index > 0) {
        const gap = position - positions[index - 1] - 1;
        score -= GAP_START + (gap - 1) * GAP_EXTENSION;
      }
      chunk = boundary;
      bonus = boundary;
    }
    // 最初の文字の点数は 2 倍にする
    score += MATCH + (index === 0 ? bonus * 2 : bonus);
  });
  if (positions[0] >= nameStart) {
    score += NAME;
    if (positions[0] === nameStart) {
      score += PREFIX;
    }
  }
  return score;
}

export type FuzzyMatch = {
  score: number;
  // 一致した文字（元の文字列の何文字目か。コードポイント単位）
  name: Set<number>;
  location: Set<number>;
};

// 場所（親のフォルダのパスなど。一番上は空文字）と名前に、すべての語が含まれていれば点数と一致した文字を返す
export function fuzzyMatch(query: Query, location: string, name: string): FuzzyMatch | null {
  const prefix = location ? fold(`${location}/`) : { chars: [], origin: [] };
  const folded = fold(name);
  const target = [...prefix.chars, ...folded.chars];
  const nameStart = prefix.chars.length;
  const locationLength = [...location].length;
  const result: FuzzyMatch = { score: 0, name: new Set(), location: new Set() };
  for (const term of query) {
    // 名前の中で見つかればそちらを使う（場所だけで一致したものより上にする）
    const positions = find(target, term, nameStart) ?? find(target, term, 0);
    if (!positions) {
      return null;
    }
    result.score += termScore(target, positions, nameStart);
    for (const position of positions) {
      const inName = position >= nameStart;
      const [from, to] = inName ? folded.origin[position - nameStart] : prefix.origin[position];
      for (let index = from; index <= to; index++) {
        if (inName) {
          result.name.add(index);
        } else if (index < locationLength) {
          result.location.add(index);
        }
      }
    }
  }
  return result;
}
