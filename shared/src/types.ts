/**
 * The shapes that cross the boundary between the database, the two apps and the
 * tests. Rows come back from SQLite with integers where the domain wants booleans,
 * so every repository maps into these types rather than leaking raw rows upward.
 */

export interface Household {
	id: string;
	/** "The Smith Family" or "John & Jane Smith" -- whatever goes on the envelope. */
	name: string;
	/** URL-safe random token; the only credential a guest ever presents. */
	token: string;
	email: string | null;
	phone: string | null;
	mailingAddress: string | null;
	/** How many people we expect from this household, used for the invited total. */
	partySize: number;
	/** Free-form grouping ("Save the dates", "Batch 2") for per-batch analytics. */
	batch: string | null;
	notes: string | null;
	invitationSent: boolean;
	invitationSentAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface Rsvp {
	id: string;
	householdId: string;
	attending: boolean;
	/** Guests attending from the household itself (excluding plus-ones). */
	guestCount: number;
	/** Additional guests the household is bringing. Uncapped by design. */
	plusOneCount: number;
	submittedAt: string;
	updatedAt: string;
	ipAddress: string | null;
	userAgent: string | null;
}

/** A household joined to its RSVP, which is what nearly every screen actually wants. */
export interface HouseholdWithRsvp extends Household {
	rsvp: Rsvp | null;
	/** 'attending' | 'declined' | 'pending', derived from the RSVP. */
	status: RsvpStatus;
	/** Head count this household contributes: 0 unless attending. */
	attendingTotal: number;
}

export type RsvpStatus = 'attending' | 'declined' | 'pending';

export type ActivityEventType =
	| 'rsvp_submitted'
	| 'rsvp_updated'
	| 'guest_added'
	| 'guest_edited'
	| 'guest_deleted'
	| 'reminder_sent'
	| 'csv_imported'
	| 'invitation_generated'
	| 'settings_changed'
	| 'content_changed'
	| 'backup_created'
	| 'backup_restored'
	| 'admin_login';

export interface ActivityEntry {
	id: string;
	eventType: ActivityEventType;
	description: string;
	householdId: string | null;
	/** Parsed from the stored JSON blob; `null` when there was nothing to record. */
	metadata: Record<string, unknown> | null;
	ipAddress: string | null;
	createdAt: string;
}

export interface EmailTemplate {
	id: string;
	name: string;
	subject: string;
	bodyHtml: string;
	createdAt: string;
	updatedAt: string;
}

export type EmailStatus = 'sent' | 'failed' | 'bounced';

export interface EmailLogEntry {
	id: string;
	householdId: string;
	templateId: string | null;
	subject: string;
	sentAt: string;
	status: EmailStatus;
	error: string | null;
}

export interface SiteImage {
	id: string;
	section: string;
	filename: string;
	mimetype: string;
	sortOrder: number;
	createdAt: string;
	/** Only loaded by the image-serving endpoint; listings omit the blob. */
	data?: Buffer;
}

// --- Site content -----------------------------------------------------------
// Each key in `site_content` stores one JSON document. These are those documents.

export interface HeroContent {
	title: string;
	subtitle: string;
	dateLine: string;
	/** Id of a row in `site_images`, or null for the plain gradient. */
	imageId: string | null;
}

export interface StoryMilestone {
	id: string;
	date: string;
	title: string;
	description: string;
	imageId: string | null;
}

export interface StoryContent {
	heading: string;
	milestones: StoryMilestone[];
	narrative: string;
}

export interface DetailsField {
	id: string;
	label: string;
	value: string;
}

export interface DetailsContent {
	heading: string;
	dateLine: string;
	timeLine: string;
	venueName: string;
	venueAddress: string;
	mapUrl: string;
	dressCode: string;
	parking: string;
	extras: DetailsField[];
}

export interface PartyMember {
	id: string;
	name: string;
	role: string;
	bio: string;
	imageId: string | null;
}

export interface PartyContent {
	heading: string;
	intro: string;
	members: PartyMember[];
}

export interface GalleryContent {
	heading: string;
	intro: string;
	/** Link across to the pictureQR uploader; empty string hides the callout. */
	uploaderUrl: string;
	uploaderNote: string;
}

export interface RegistryLink {
	id: string;
	name: string;
	url: string;
	description: string;
}

export interface RegistryContent {
	heading: string;
	intro: string;
	links: RegistryLink[];
}

export interface FaqItem {
	id: string;
	question: string;
	answer: string;
}

export interface FaqContent {
	heading: string;
	intro: string;
	items: FaqItem[];
}

/** Which sections appear in the guest site's navigation and are reachable at all. */
export interface SectionToggles {
	story: boolean;
	details: boolean;
	party: boolean;
	gallery: boolean;
	registry: boolean;
	faq: boolean;
	countdown: boolean;
}

export interface SiteContent {
	hero: HeroContent;
	story: StoryContent;
	details: DetailsContent;
	party: PartyContent;
	gallery: GalleryContent;
	registry: RegistryContent;
	faq: FaqContent;
	sections: SectionToggles;
	announcement: string;
}

export type SiteContentKey = keyof SiteContent;

// --- Aggregates -------------------------------------------------------------

export interface DashboardStats {
	households: number;
	invitedGuests: number;
	responded: number;
	responseRate: number;
	attendingHouseholds: number;
	attendingGuests: number;
	declinedHouseholds: number;
	declinedGuests: number;
	pendingHouseholds: number;
	pendingGuests: number;
	plusOnes: number;
	invitationsSent: number;
}

export interface ResponsePoint {
	date: string;
	responses: number;
	cumulative: number;
	attending: number;
	declined: number;
}
