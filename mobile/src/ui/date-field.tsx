import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Text, useTheme } from '@/ui';

const pad = (n: number) => String(n).padStart(2, '0');
export const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Tap-to-pick date or time. Value is "YYYY-MM-DD" or "HH:MM". */
export function DateField({ label, value, onChange, mode = 'date', minimumDate }: { label: string; value: string; onChange: (v: string) => void; mode?: 'date' | 'time'; minimumDate?: Date }) {
    const t = useTheme();
    const [open, setOpen] = useState(false);
    const current = value ? new Date(mode === 'date' ? `${value}T12:00:00` : `2000-01-01T${value}:00`) : new Date();
    const shown = !value ? (mode === 'date' ? 'Choose a date' : 'Choose a time')
        : mode === 'date' ? current.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : value;
    return (
        <View style={{ gap: 6 }}>
            <Text variant="label">{label}</Text>
            <Pressable onPress={() => setOpen(true)} style={{ height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: t.border, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: t.surface }}>
                <Text color={value ? 'ink' : 'muted'}>{shown}</Text>
            </Pressable>
            {open && (
                <DateTimePicker
                    value={current}
                    mode={mode}
                    minimumDate={minimumDate}
                    is24Hour
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(e, d) => {
                        setOpen(false);
                        if (e.type === 'set' && d) onChange(mode === 'date' ? toDate(d) : toTime(d));
                    }}
                />
            )}
        </View>
    );
}
