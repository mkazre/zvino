import type Ionicons from '@expo/vector-icons/Ionicons';

type IconName = keyof typeof Ionicons.glyphMap;

/** Clean icon for a food / shop category by name (instead of emoji). */
const RULES: [RegExp, IconName][] = [
    [/pizza/i, 'pizza-outline'],
    [/burger|fast ?food|takeaway/i, 'fast-food-outline'],
    [/grill|braai|bbq|flame|spicy/i, 'flame-outline'],
    [/coffee|caf|tea|breakfast/i, 'cafe-outline'],
    [/drink|beverage|juice|soda|water/i, 'water-outline'],
    [/beer|wine|liquor|alcohol|bar/i, 'beer-outline'],
    [/dessert|ice ?cream|cake|bak|sweet/i, 'ice-cream-outline'],
    [/fish|sea ?food|sushi/i, 'fish-outline'],
    [/veg|salad|healthy|vegan/i, 'leaf-outline'],
    [/fruit|fresh|produce/i, 'nutrition-outline'],
    [/grocer|market|shop|super/i, 'basket-outline'],
    [/pharm|health|medic/i, 'medkit-outline'],
    [/chicken|wings/i, 'restaurant-outline'],
];

export function categoryIcon(name?: string | null): IconName {
    return RULES.find(([re]) => re.test(name ?? ''))?.[1] ?? 'restaurant-outline';
}
