import { campusDate } from './scheduleUtils';

// Recurring Gregorian occasions only, not a university academic calendar.
// Sources: https://pm.gov.jo/Ar/Pages/PublicNoticeDetails/2388
// https://www.pm.gov.jo/Ar/NewsDetails/am0570
// Actual closure/substitute days still depend on the year's official notice.
export const FIXED_HOLIDAYS = [
  { id: 'new-year', monthDay: '01-01', title: 'رأس السنة الميلادية' },
  {
    id: 'labour-day',
    monthDay: '05-01',
    title: 'عيد العمال',
    note: 'قد يُنقل يوم التعطيل ببلاغ رسمي؛ هذا تاريخ المناسبة فقط.',
  },
  { id: 'independence-day', monthDay: '05-25', title: 'عيد الاستقلال' },
  { id: 'christmas', monthDay: '12-25', title: 'عيد الميلاد المجيد' },
] as const;

export function nearestFixedHoliday(now: number) {
  const today = campusDate(now);
  const year = Number(today.slice(0, 4));
  return FIXED_HOLIDAYS.map((holiday) => {
    const thisYear = `${year}-${holiday.monthDay}`;
    return {
      ...holiday,
      date: thisYear >= today ? thisYear : `${year + 1}-${holiday.monthDay}`,
    };
  }).sort((a, b) => a.date.localeCompare(b.date))[0]!;
}
