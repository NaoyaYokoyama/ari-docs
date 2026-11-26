// 日本の祝日（WBS のガントチャートで休みの日を色分けする。FN0602-BR14）。
// サーバーの back/src/common/holiday.rs と同じ決まりで計算する（2020 年以降の決まり。春分・秋分は 2099 年までの近似式）

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function equinox(year: number, base: number) {
  const offset = year - 1980;
  return Math.floor(base + 0.242194 * offset - Math.floor(offset / 4));
}

// 法律で日付・曜日が決まっている祝日
function isNamedHoliday(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const monday = (nth: number) => date.getDay() === 1 && Math.floor((day - 1) / 7) + 1 === nth;
  switch (month) {
    case 1:
      return day === 1 || monday(2);
    case 2:
      return day === 11 || day === 23;
    case 3:
      return day === equinox(year, 20.8431);
    case 4:
      return day === 29;
    case 5:
      return day >= 3 && day <= 5;
    case 7:
      return monday(3);
    case 8:
      return day === 11;
    case 9:
      return monday(3) || day === equinox(year, 23.2488);
    case 10:
      return monday(2);
    case 11:
      return day === 3 || day === 23;
    default:
      return false;
  }
}

// 祝日（振替休日・国民の休日を含む）か
export function isHoliday(date: Date) {
  if (isNamedHoliday(date)) {
    return true;
  }
  // 国民の休日: 前後の日が祝日
  if (date.getDay() !== 0 && isNamedHoliday(addDays(date, -1)) && isNamedHoliday(addDays(date, 1))) {
    return true;
  }
  // 振替休日: 日曜の祝日から続く祝日の次の日
  let day = date;
  for (let i = 0; i < 7; i += 1) {
    const previous = addDays(day, -1);
    if (!isNamedHoliday(previous)) {
      return false;
    }
    if (previous.getDay() === 0) {
      return true;
    }
    day = previous;
  }
  return false;
}
