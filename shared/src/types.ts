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
	/**
	 * How many guests *beyond* `partySize` this household may add when replying, or
	 * null for no limit.
	 *
	 * Per household because the right answer differs household by household: a couple
	 * bringing a partner needs one, a family whose children are already counted needs
	 * none, and an open invitation needs no cap at all.
	 */
	maxExtraGuests: number | null;
	/** Free-form grouping ("Save the dates", "Batch 2") for per-batch analytics. */
	batch: string | null;
	/** Which side of the family, if the couple track it. Free-form and optional. */
	side: string | null;
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
	/** Additional guests the household is bringing, within its own cap if it has one. */
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
	| 'backup_deleted'
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
	/**
	 * Ids of the standard rows the couple has switched off -- see `DETAILS_ROWS` in
	 * `details.ts`. Kept separate from the text so turning a row back on restores the
	 * wording they wrote rather than an empty field.
	 */
	hiddenRows: string[];
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

/** One line of the couple's own wording, placed among the fixed blocks. */
export interface InvitationLine {
	id: string;
	text: string;
	/** How prominently it is set: a heading, ordinary text, or a small note. */
	style: 'display' | 'body' | 'small';
	/** Which of the three slots on the card it sits in. */
	slot: 'top' | 'middle' | 'bottom';
}

export interface InvitationContent {
	/** Small caps line above the names. */
	eyebrow: string;
	/** Usually the couple's names, but the couple may word it their own way. */
	names: string;
	/** The line between the names and the date. */
	inviteLine: string;
	dateLine: string;
	timeLine: string;
	/**
	 * Where the ceremony is.
	 *
	 * Named `venue*` rather than `ceremony*` because these fields predate the split and
	 * renaming them would orphan every stored invitation. When there is no reception
	 * address this is simply "the venue", and no label is printed above it.
	 */
	venueName: string;
	venueAddress: string;
	/** Printed above the ceremony venue, and only when a reception is also set. */
	ceremonyLabel: string;
	/** A second location. Empty means the reception is at the ceremony venue. */
	receptionName: string;
	receptionAddress: string;
	receptionLabel: string;
	/** The couple's own lines, in the order they were added within each slot. */
	lines: InvitationLine[];
	/** Caption printed under the QR code. */
	qrCaption: string;
	/**
	 * Id of a row in `site_images` to print at the head of the card, or null.
	 *
	 * Restricted to JPEG and PNG on upload: pdf-lib embeds only those two, and a WebP
	 * that previewed perfectly and then vanished from the print would be the worst
	 * possible way to find that out.
	 */
	photoId: string | null;
	/** Whether the fallback URL is printed under the caption. */
	showUrl: boolean;
	showQr: boolean;
	showPhoto: boolean;
	showBorder: boolean;
	/**
	 * A band across the head of the card, or the whole card behind the wording.
	 *
	 * The background mode lays a scrim over the photo before any text is drawn --
	 * without it the wording is legible or not depending on which part of the photo
	 * happens to sit behind it, which is not something the couple can judge from a
	 * thumbnail.
	 */
	photoMode: 'band' | 'background';
	/** Whether the wording is centred or ranged left. */
	align: 'center' | 'left';
	/** The QR block at the foot, or tucked into the bottom-right corner. */
	qrPosition: 'foot' | 'corner';
	/** Multiplier on every type size. 1 is the shipped card. */
	scale: number;
	/** Multiplier on the gaps between blocks. 1 is the shipped card. */
	spacing: number;
	/** 'serif' or 'sans' -- which of the two standard PDF families to set it in. */
	font: 'serif' | 'sans';
	/** Hex colour for the rule, the border and the eyebrow. */
	accent: string;
	/** Hex colour for the printed text. */
	ink: string;
	/** Hex colour for the card itself. */
	background: string;
}

/** Look-and-feel choices that apply across the whole guest site. */
export interface ThemeContent {
	/** Hex accent, used for buttons, links and focus rings. */
	accent: string;
	/**
	 * Hex colour for body and heading text.
	 *
	 * Chosen against the light palette, because that is what the editor previews. The
	 * dark palette cannot reuse it -- a near-black chosen for a cream page is invisible
	 * on a dark one -- so `themeCss` lifts it there, keeping the hue and changing only
	 * how light it is.
	 */
	ink: string;
	/** Which pairing of display and body faces to set the site in. */
	fonts: 'serif-sans' | 'sans-sans' | 'serif-serif';
	/** How the home page hero treats its photo. */
	hero: 'photo' | 'tint' | 'plain';
	/** Section keys in the order they appear in the navigation. */
	order: string[];
}

/** Wording that is not part of any one section: buttons, labels, the footer. */
export interface WordingContent {
	rsvpButton: string;
	detailsButton: string;
	footerNote: string;
	rsvpHeading: string;
	rsvpIntro: string;
	rsvpAcceptLabel: string;
	rsvpDeclineLabel: string;
	rsvpCountQuestion: string;
	rsvpSubmitLabel: string;
	rsvpUpdateLabel: string;
	thanksAttendingHeading: string;
	thanksAttendingBody: string;
	thanksDecliningHeading: string;
	thanksDecliningBody: string;
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
	theme: ThemeContent;
	wording: WordingContent;
	invitation: InvitationContent;
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
