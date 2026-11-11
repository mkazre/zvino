/**
 * Time-of-day meal word for headlines: Breakfast (05:00–10:59), Lunch (11:00–15:59), Dinner otherwise,
 * in Zimbabwe time. In a headline, "{meal}" or a leading Breakfast / Lunch / Dinner is swapped for it.
 */
export function mealNow(date = new Date()): 'Breakfast' | 'Lunch' | 'Dinner' {
    const hour = (date.getUTCHours() + 2) % 24; // Zimbabwe is UTC+2 all year (no daylight saving)
    return hour >= 5 && hour < 11 ? 'Breakfast' : hour >= 11 && hour < 16 ? 'Lunch' : 'Dinner';
}

export function withMeal(text: string | null | undefined, date = new Date()): string {
    if (!text) return text ?? '';
    const meal = mealNow(date);
    return text.replace(/\{meal\}/gi, meal).replace(/^(\s*)(Breakfast|Lunch|Dinner)\b/i, (_, space: string) => space + meal);
}
