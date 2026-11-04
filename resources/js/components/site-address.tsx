import { Button } from '@/components/ui/button';
import { Input, Modal, Select, Textarea } from '@/components/z';
import { cn } from '@/lib/utils';
import { router, useForm } from '@inertiajs/react';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';

/** New delivery address with landmark, instructions and GPS pin. Used at checkout and in the account. */
export function AddressModal({ open, onClose, cities }: { open: boolean; onClose: () => void; cities: string[] }) {
    const { data, setData, post, processing, errors, reset } = useForm({ label: 'Home', line1: '', landmark: '', suburb: '', city: cities[0], instructions: '', lat: '' as string | number, lng: '' as string | number, is_default: true });
    const locate = () => navigator.geolocation?.getCurrentPosition((p) => { setData((d) => ({ ...d, lat: p.coords.latitude, lng: p.coords.longitude })); toast.success('Location pinned 📍'); }, () => toast.error('Couldn’t get your location'));
    return (
        <Modal open={open} onClose={onClose} title="New delivery address" description="Landmarks help drivers find you. Zimbabwean addresses can be tricky!"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="dark" disabled={processing || !data.line1} onClick={() => post('/account/addresses', { preserveScroll: true, onSuccess: () => { reset(); onClose(); router.reload({ only: ['addresses'] }); } })}>Save address</Button></>}>
            <div className="grid gap-3">
                <div className="flex gap-2">{['Home', 'Work', 'Other'].map((l) => <button key={l} onClick={() => setData('label', l)} className={cn('h-9 rounded-full px-4 text-sm font-semibold', data.label === l ? 'bg-[#111412] text-white' : 'bg-muted')}>{l}</button>)}</div>
                <Input value={data.line1} onChange={(e) => setData('line1', e.target.value)} placeholder="Street address, e.g. 12 Josiah Tongogara Ave" invalid={!!errors.line1} />
                <Input value={data.landmark} onChange={(e) => setData('landmark', e.target.value)} placeholder="Landmark, e.g. opposite OK Mart, blue gate" />
                <div className="grid grid-cols-2 gap-2">
                    <Input value={data.suburb} onChange={(e) => setData('suburb', e.target.value)} placeholder="Suburb" />
                    <Select value={data.city} onChange={(e) => setData('city', e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</Select>
                </div>
                <Textarea value={data.instructions} onChange={(e) => setData('instructions', e.target.value)} placeholder="Instructions for the driver (gate code, dogs, call when outside…)" className="min-h-[64px]" />
                <button type="button" onClick={locate} className={cn('flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold', data.lat && 'border-[#0b6e4f] text-[#0b6e4f]')}><MapPin className="size-4" />{data.lat ? 'Exact location pinned ✓' : 'Use my current location'}</button>
            </div>
        </Modal>
    );
}
