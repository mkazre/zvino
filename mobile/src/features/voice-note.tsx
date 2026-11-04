import Ionicons from '@expo/vector-icons/Ionicons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { Row, Text, useTheme } from '@/ui';

/** Record (up to 60 s) and upload voice-note directions for the driver, in any language (#5). */
export function VoiceNoteRecorder({ addressId, existing, onSaved }: { addressId: number; existing: string | null; onSaved: () => void }) {
    const t = useTheme();
    const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
    const state = useAudioRecorderState(recorder, 500);
    const [busy, setBusy] = useState(false);

    const start = async () => {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) return Alert.alert('Microphone', 'Allow the microphone to record directions.');
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setTimeout(() => recorder.isRecording && stop(), 60000);
    };
    const stop = async () => {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false });
        if (!recorder.uri) return;
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append('voice_note', { uri: recorder.uri, name: 'directions.m4a', type: 'audio/m4a' } as unknown as Blob);
            await api.post(`/addresses/${addressId}/media`, fd);
            onSaved();
        } catch (e) {
            Alert.alert('Voice note', e instanceof ApiError ? e.friendly : 'Upload failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Row gap={10} style={{ marginTop: 8 }}>
            <Pressable onPress={state.isRecording ? stop : start} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: state.isRecording ? t.red : t.subtle }}>
                <Ionicons name={state.isRecording ? 'stop' : 'mic'} size={16} color={state.isRecording ? '#fff' : t.ink} />
                <Text variant="label" style={{ color: state.isRecording ? '#fff' : t.ink }}>{state.isRecording ? `Stop · ${Math.round((state.durationMillis ?? 0) / 1000)}s` : busy ? 'Saving…' : existing ? 'Re-record directions' : 'Record voice directions'}</Text>
            </Pressable>
            {existing && !state.isRecording && <VoiceNotePlayer path={existing} compact />}
        </Row>
    );
}

export function VoiceNotePlayer({ path, compact }: { path: string; compact?: boolean }) {
    const t = useTheme();
    const player = useAudioPlayer({ uri: /^https?:/.test(path) ? path : `${API_URL}${path}` });
    return (
        <Pressable onPress={() => { player.seekTo(0); player.play(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: t.brandSoft }}>
            <Ionicons name="play" size={16} color={t.brand} />
            <Text variant="label" color="brand">{compact ? 'Play' : 'Play customer’s voice directions'}</Text>
        </Pressable>
    );
}
