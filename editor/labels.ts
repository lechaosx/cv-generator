export const LABELS: Record<string, Record<string, string>> = window.CV_LABELS ?? { en: {} };

export function t(key: string, language: string): string {
	return (LABELS[language] ?? LABELS['en'] ?? {})[key] ?? key;
}
