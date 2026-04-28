'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/hooks/useSettings';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type Copy = {
  title: string;
  description: string;
  toggleLabel: string;
  enabledLabel: string;
  disabledLabel: string;
  saving: string;
};

const COPY: Record<AppLanguageCode, Copy> = {
  en: {
    title: 'Email notifications',
    description: 'Get emails when your project is created and when the final video is ready.',
    toggleLabel: 'Project lifecycle emails',
    enabledLabel: 'Enabled',
    disabledLabel: 'Disabled',
    saving: 'Saving...',
  },
  ru: {
    title: 'Email-уведомления',
    description: 'Получайте письма, когда проект создан и когда финальное видео готово.',
    toggleLabel: 'Письма о статусе проекта',
    enabledLabel: 'Включено',
    disabledLabel: 'Выключено',
    saving: 'Сохраняем...',
  },
};

export function ProjectEmailNotificationCard() {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const { settings, update } = useSettings();
  const [saving, setSaving] = useState(false);

  const checked = settings?.projectEmailsEnabled ?? true;

  const onToggle = async (value: boolean) => {
    if (!settings) return;
    if (value === checked) return;
    setSaving(true);
    try {
      await update('projectEmailsEnabled', value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          <span>{copy.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-gray-600 dark:text-gray-300">{copy.description}</p>
        <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-gray-900 dark:text-gray-100">{copy.toggleLabel}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {checked ? copy.enabledLabel : copy.disabledLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {saving ? (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {copy.saving}
              </span>
            ) : null}
            <Switch checked={checked} onCheckedChange={(v) => void onToggle(!!v)} disabled={saving || !settings} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
