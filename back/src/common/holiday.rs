//! 日本の祝日（国民の祝日に関する法律）。通信せずに計算する（FN0602-BR10）
//!
//! 2020 年以降の決まりで計算する（それより前の年は移動した祝日がずれることがある）。
//! 春分・秋分の日は 2099 年までの近似式

use chrono::{Datelike, Days, NaiveDate, Weekday};

/// 祝日（振替休日・国民の休日を含む）か
pub fn is_holiday(date: NaiveDate) -> bool {
    if is_named_holiday(date) {
        return true;
    }
    // 国民の休日: 前後の日が祝日で、その日が祝日でない
    let around = |days: u64, after: bool| {
        let day = if after {
            date.checked_add_days(Days::new(days))
        } else {
            date.checked_sub_days(Days::new(days))
        };
        day.is_some_and(is_named_holiday)
    };
    if date.weekday() != Weekday::Sun && around(1, false) && around(1, true) {
        return true;
    }
    // 振替休日: 日曜の祝日から続く祝日の次の日
    let mut day = date;
    loop {
        let Some(previous) = day.checked_sub_days(Days::new(1)) else {
            return false;
        };
        if !is_named_holiday(previous) {
            return false;
        }
        if previous.weekday() == Weekday::Sun {
            return true;
        }
        day = previous;
    }
}

/// 土日・祝日でない日
pub fn is_business_day(date: NaiveDate) -> bool {
    !matches!(date.weekday(), Weekday::Sat | Weekday::Sun) && !is_holiday(date)
}

// 法律で日付・曜日が決まっている祝日
fn is_named_holiday(date: NaiveDate) -> bool {
    let (year, month, day) = (date.year(), date.month(), date.day());
    let monday = |nth: u32| date.weekday() == Weekday::Mon && (day - 1) / 7 + 1 == nth;
    match month {
        1 => day == 1 || monday(2),
        2 => day == 11 || day == 23,
        3 => day == equinox(year, 20.8431),
        4 => day == 29,
        5 => (3..=5).contains(&day),
        7 => monday(3),
        8 => day == 11,
        9 => monday(3) || day == equinox(year, 23.2488),
        10 => monday(2),
        11 => day == 3 || day == 23,
        _ => false,
    }
}

// 春分・秋分の日（1980〜2099 年の近似式）
fn equinox(year: i32, base: f64) -> u32 {
    let offset = f64::from(year - 1980);
    (base + 0.242194 * offset - (offset / 4.0).floor()).floor() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(text: &str) -> NaiveDate {
        NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn holidays_of_2026() {
        // 内閣府の 2026 年の祝日
        let expected = [
            "2026-01-01",
            "2026-01-12",
            "2026-02-11",
            "2026-02-23",
            "2026-03-20",
            "2026-04-29",
            "2026-05-03",
            "2026-05-04",
            "2026-05-05",
            "2026-05-06", // 振替休日（5/3 が日曜）
            "2026-07-20",
            "2026-08-11",
            "2026-09-21",
            "2026-09-22", // 国民の休日
            "2026-09-23",
            "2026-10-12",
            "2026-11-03",
            "2026-11-23",
        ];
        let mut found = Vec::new();
        let mut day = d("2026-01-01");
        while day.year() == 2026 {
            if is_holiday(day) {
                found.push(day.to_string());
            }
            day = day.succ_opt().unwrap();
        }
        assert_eq!(found, expected);
    }

    #[test]
    fn substitute_and_equinox() {
        // 2027 年: 春分 3/21（日）→ 3/22 振替、秋分 9/23
        assert!(is_holiday(d("2027-03-21")));
        assert!(is_holiday(d("2027-03-22")));
        assert!(is_holiday(d("2027-09-23")));
        assert!(!is_holiday(d("2027-09-22")));
        assert!(is_business_day(d("2026-11-27")));
        assert!(!is_business_day(d("2026-11-28")));
        assert!(!is_business_day(d("2026-11-23")));
    }
}
