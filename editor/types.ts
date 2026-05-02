export interface TimelineEntry {
	title: string;
	organization: string;
	department: string;
	start_month: string;
	start_year: string;
	end_month: string;
	end_year: string;
	description: string | string[];
	badges: string[];
}

export interface LinkEntry {
	platform: string;
	url: string;
}

export interface CVState {
	name: string;
	position: string;
	location: string;
	phone: string;
	email: string;
	description: string | string[];
	interests: string[];
	links: LinkEntry[] | Record<string, string>;
	photo: string;
	experience: TimelineEntry[];
	education: TimelineEntry[];
	theme: Record<string, string>;
	language: string;
	title_before_name: string;
	title_after_name: string;
	[key: string]: unknown;
}

export interface UndoSnapshot {
	state: CVState;
	themeColors: Record<string, string>;
	colorLinks: Record<string, string>;
}

export interface PhotoRecord {
	data: string;
	name: string;
}

declare global {
	interface Window {
		CV_DATA: CVState;
		CV_LABELS: Record<string, Record<string, string>>;
		jsyaml: { load: (yaml: string) => unknown };
	}
}
