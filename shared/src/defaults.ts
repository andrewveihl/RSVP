/**
 * What the guest site says before anyone has edited a word of it.
 *
 * These are real defaults, not placeholders to be swapped out later: an admin who
 * never opens the content editor still gets a complete, coherent site. Every string is
 * therefore written to be true of any wedding, and the FAQ ships pre-populated with the
 * standard questions the brief lists.
 */
import type { SiteContent } from './types';

export function defaultSiteContent(coupleNames = 'Andrew & Madeline'): SiteContent {
	return {
		hero: {
			title: coupleNames,
			subtitle: 'are getting married',
			dateLine: 'May 29, 2027',
			imageId: null
		},
		theme: {
			// Sage. Chosen for the interface, not for charts -- see admin/src/app.css for
			// why the dashboard uses a different palette entirely.
			accent: '#8A9A7B',
			fonts: 'serif-sans',
			hero: 'photo',
			order: ['story', 'details', 'party', 'gallery', 'registry', 'faq']
		},
		wording: {
			rsvpButton: 'RSVP',
			detailsButton: 'Event details',
			footerNote: 'Questions?',
			rsvpHeading: 'RSVP',
			rsvpIntro: '',
			rsvpAcceptLabel: 'Joyfully accepts',
			rsvpDeclineLabel: 'Regretfully declines',
			rsvpCountQuestion: 'How many of you are coming?',
			rsvpSubmitLabel: 'Send our reply',
			rsvpUpdateLabel: 'Update our reply',
			thanksAttendingHeading: 'Thank you!',
			thanksAttendingBody: "We can't wait to celebrate with you.",
			thanksDecliningHeading: "We'll miss you!",
			thanksDecliningBody: 'Thank you for letting us know.'
		},
		invitation: {
			eyebrow: 'TOGETHER WITH THEIR FAMILIES',
			names: coupleNames,
			inviteLine: 'invite you to celebrate their marriage',
			dateLine: 'Saturday, May 29, 2027',
			timeLine: 'Four in the afternoon',
			venueName: 'The Venue',
			venueAddress: '123 Somewhere Road, Your Town',
			qrCaption: 'SCAN TO RSVP',
			photoId: null,
			showUrl: true,
			showQr: true,
			// Off until a photo is actually chosen, so the default card is unchanged.
			showPhoto: false,
			showBorder: true,
			font: 'serif',
			accent: '#8A9A7B'
		},
		story: {
			heading: 'Our Story',
			milestones: [
				{
					id: 'milestone-met',
					date: 'The beginning',
					title: 'How we met',
					description:
						'Tell the story here -- where you met, who spoke first, and what neither of you admitted at the time.',
					imageId: null
				},
				{
					id: 'milestone-proposal',
					date: 'The question',
					title: 'The proposal',
					description: 'Where it happened, who cried first, and whether the ring stayed hidden.',
					imageId: null
				}
			],
			narrative:
				'This is the longer version -- the part that does not fit on a timeline. Edit it from the admin panel under Content.'
		},
		details: {
			heading: 'Event Details',
			dateLine: 'Saturday, May 29, 2027',
			timeLine: 'Ceremony at 4:00 pm, reception to follow',
			venueName: 'The Venue',
			venueAddress: '123 Somewhere Road, Your Town',
			mapUrl: '',
			dressCode: 'Semi-formal. Think garden party rather than black tie.',
			parking: 'Free parking is available on site.',
			extras: [],
			hiddenRows: []
		},
		party: {
			heading: 'Wedding Party',
			intro: 'The people standing beside us.',
			members: []
		},
		gallery: {
			heading: 'Photos',
			intro: 'A few of our favourites.',
			uploaderUrl: '',
			uploaderNote: 'Want to share your own photos from the day? Use our photo app.'
		},
		registry: {
			heading: 'Registry',
			intro: 'Your presence is the gift. If you would like to give something more, here is where we are registered.',
			links: []
		},
		faq: {
			heading: 'Questions',
			intro: 'If your question is not here, just ask us.',
			items: [
				{
					id: 'faq-dress-code',
					question: 'What is the dress code?',
					answer: 'Semi-formal. We would rather you were comfortable than perfectly matched.'
				},
				{
					id: 'faq-plus-one',
					question: 'Can I bring a plus-one?',
					answer:
						'Yes -- add them to your guest count when you RSVP so we can set a place for them.'
				},
				{
					id: 'faq-children',
					question: 'Are children welcome?',
					answer: 'Children are welcome. Please include them in your guest count.'
				},
				{
					id: 'faq-parking',
					question: 'Where should I park?',
					answer: 'There is free parking at the venue. See the Details page for directions.'
				},
				{
					id: 'faq-deadline',
					question: 'When is the RSVP deadline?',
					answer: 'The date is shown on your RSVP page. Please reply before then so we can finalise numbers.'
				}
			]
		},
		sections: {
			story: true,
			details: true,
			party: true,
			gallery: true,
			registry: true,
			faq: true,
			countdown: true
		},
		announcement: ''
	};
}

/**
 * The two reminder templates the couple will actually send, seeded on first boot so
 * the Emails screen is never an empty page with a "create one" button.
 */
export function defaultEmailTemplates(): { name: string; subject: string; bodyHtml: string }[] {
	return [
		{
			name: 'First Reminder',
			subject: 'A gentle reminder to RSVP -- {{couple_names}}',
			bodyHtml: [
				'<p>Hi {{household_name}},</p>',
				'<p>We are getting our numbers together for {{wedding_date}} at {{venue}}, and we have not heard from you yet.</p>',
				'<p>It only takes a moment: <a href="{{rsvp_link}}">RSVP here</a>.</p>',
				'<p>Please let us know by {{deadline}}.</p>',
				'<p>With love,<br>{{couple_names}}</p>'
			].join('\n')
		},
		{
			name: 'Invitation',
			subject: "You're invited -- {{couple_names}}",
			bodyHtml: [
				'<p>Dear {{household_name}},</p>',
				'<p>We are getting married on {{wedding_date}} at {{venue}}, and we would love you to be there.</p>',
				'{{qr_code}}',
				'<p style="text-align:center"><a href="{{rsvp_link}}">Scan the code, or tap here to RSVP</a></p>',
				'<p>Please let us know by {{deadline}}.</p>',
				'<p>With love,<br>{{couple_names}}</p>'
			].join('\n')
		},
		{
			name: 'Last Call',
			subject: 'Last call for RSVPs -- {{couple_names}}',
			bodyHtml: [
				'<p>Hi {{household_name}},</p>',
				'<p>Our final headcount is due to the venue shortly, so this is the last call.</p>',
				'<p><a href="{{rsvp_link}}">Let us know whether you can make it</a> before {{deadline}}.</p>',
				'<p>Either way, thank you -- it helps enormously to know.</p>',
				'<p>{{couple_names}}</p>'
			].join('\n')
		}
	];
}
