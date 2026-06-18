import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { User, Camera } from 'lucide-react';

import AuthLayout from '@/components/layout/AuthLayout';
import { useAppStore } from '@/lib/store/index';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const DESIGNATIONS = [
    'Surgeon',
    'Resident',
    'Fellow',
    'Radiologist',
    'Researcher',
    'Other',
] as const;

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const CompleteProfilePage = () => {
    const token = useAppStore((state) => state.token);
    const setProfileCompleted = useAppStore((state) => state.setProfileCompleted);
    const setToken = useAppStore((state) => state.setToken);
    const updateUser = useAppStore((state) => state.updateUser);
    const navigate = useNavigate();

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    const [fullName, setFullName] = useState('');
    const [designation, setDesignation] = useState('');
    const [country, setCountry] = useState('');

    const [fileError, setFileError] = useState<string | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset previous file error
        setFileError(null);

        // Client-side validation
        if (!ACCEPTED_MIME_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE_BYTES) {
            setFileError('File must be JPEG, PNG, or WebP and under 5 MB');
            // Reset input so the same file can be re-selected after fixing
            e.target.value = '';
            return;
        }

        // Upload avatar
        setUploadingAvatar(true);
        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const res = await axios.post('http://localhost:3001/auth/upload-avatar', formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                },
            });

            const { url } = res.data;
            setAvatarUrl(url);
            setAvatarPreview(url);
        } catch (err: unknown) {
            const message =
                axios.isAxiosError(err) && err.response?.data?.error
                    ? err.response.data.error
                    : 'Failed to upload avatar. Please try again.';
            setFileError(message);
        } finally {
            setUploadingAvatar(false);
            e.target.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setApiError(null);
        setLoading(true);

        try {
            const payload: {
                full_name: string;
                designation: string;
                country: string;
                avatar_url?: string;
            } = {
                full_name: fullName,
                designation,
                country,
            };

            if (avatarUrl) {
                payload.avatar_url = avatarUrl;
            }

            const res = await axios.post(
                'http://localhost:3001/auth/complete-profile',
                payload,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: (s) => s < 500,
                }
            );

            if (res.status === 200) {
                const data = res.data;
                setProfileCompleted(true);
                setToken(data.token);
                updateUser(data.user);
                navigate('/dashboard');
            } else {
                setApiError(res.data?.error ?? 'Something went wrong. Please try again.');
            }
        } catch (err: unknown) {
            const message =
                axios.isAxiosError(err) && err.response?.data?.error
                    ? err.response.data.error
                    : 'Something went wrong. Please try again.';
            setApiError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <Card className="w-full rounded-2xl border border-[#242427] bg-[#141416] shadow-[0_1px_2px_rgba(0,0,0,.04),0_28px_70px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <CardHeader className="space-y-1 pb-3 pt-7">
                    <CardTitle className="text-3xl font-semibold text-center tracking-tight text-[#F5F5F7]">
                        Tell us a little about yourself
                    </CardTitle>
                </CardHeader>

                <form onSubmit={handleSubmit}>
                    <CardContent className="grid gap-6 pb-6">
                        {/* Avatar picker */}
                        <div className="flex flex-col items-center gap-2">
                            <button
                                type="button"
                                onClick={handleAvatarClick}
                                disabled={uploadingAvatar}
                                className="relative h-24 w-24 rounded-full border-2 border-dashed border-[#3A3A3E] bg-[#1B1B1E] flex items-center justify-center overflow-hidden hover:border-[#FF453A] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF453A]"
                                aria-label="Add profile photo"
                            >
                                {avatarPreview ? (
                                    <img
                                        src={avatarPreview}
                                        alt="Avatar preview"
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <User className="h-10 w-10 text-[#9CA3AF]" />
                                )}
                                {/* Camera icon overlay */}
                                <span className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#FF453A] shadow">
                                    <Camera className="h-3.5 w-3.5 text-white" />
                                </span>
                            </button>

                            <span className="text-xs text-[#9CA3AF]">
                                {uploadingAvatar ? 'Uploading…' : 'Add Profile Photo'}
                            </span>

                            {/* Hidden file input */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleFileChange}
                                aria-hidden="true"
                            />

                            {fileError && (
                                <p className="text-xs text-[#FF453A] text-center">{fileError}</p>
                            )}
                        </div>

                        {/* Full Name */}
                        <div className="grid gap-2">
                            <Label
                                htmlFor="full-name"
                                className="text-[#9CA3AF] text-xs tracking-wide uppercase"
                            >
                                Full Name
                            </Label>
                            <Input
                                id="full-name"
                                type="text"
                                placeholder="Dr. Jane Smith"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                                className="h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] placeholder:text-[#9CA3AF]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0"
                            />
                        </div>

                        {/* Designation */}
                        <div className="grid gap-2">
                            <Label
                                htmlFor="designation"
                                className="text-[#9CA3AF] text-xs tracking-wide uppercase"
                            >
                                Designation
                            </Label>
                            <Select
                                value={designation}
                                onValueChange={setDesignation}
                                required
                            >
                                <SelectTrigger
                                    id="designation"
                                    className="h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] focus:ring-[#FF453A] focus:ring-offset-0"
                                >
                                    <SelectValue placeholder="Select your designation" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DESIGNATIONS.map((d) => (
                                        <SelectItem key={d} value={d}>
                                            {d}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Country */}
                        <div className="grid gap-2">
                            <Label
                                htmlFor="country"
                                className="text-[#9CA3AF] text-xs tracking-wide uppercase"
                            >
                                Country
                            </Label>
                            <Input
                                id="country"
                                type="text"
                                placeholder="United States"
                                value={country}
                                onChange={(e) => setCountry(e.target.value)}
                                required
                                className="h-11 rounded-md border-[#242427] bg-[#1B1B1E] text-[#F5F5F7] placeholder:text-[#9CA3AF]/60 focus-visible:ring-[#FF453A] focus-visible:ring-offset-0"
                            />
                        </div>

                        {/* API error */}
                        {apiError && (
                            <p className="text-sm text-[#FF453A] text-center">{apiError}</p>
                        )}

                        <Button
                            type="submit"
                            disabled={loading || uploadingAvatar}
                            className="w-full h-11 rounded-md bg-[#FF453A] text-white font-semibold hover:bg-[#e03d33] shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)]"
                        >
                            {loading ? 'Saving…' : 'Complete Profile'}
                        </Button>
                    </CardContent>
                </form>
            </Card>
        </AuthLayout>
    );
};

export default CompleteProfilePage;
