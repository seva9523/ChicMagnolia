import { z } from 'zod';

export const SUPPORT_EVENT_NAME = 'support.requested';
export const SUPPORT_NOTIFICATION_CONTACT_ID = 'fe8ec9e8-c0b5-48c1-9c81-bf04dbe0f3d0';

export const SUPPORT_TOPICS = [
  { value: 'account_access', label: 'Account access' },
  { value: 'billing', label: 'Billing' },
  { value: 'retailer_check', label: 'Retailer price or stock check' },
  { value: 'privacy_request', label: 'Privacy request' },
  { value: 'security_report', label: 'Security report' },
  { value: 'other', label: 'Other' },
] as const;

const topicValues = SUPPORT_TOPICS.map((topic) => topic.value) as [
  (typeof SUPPORT_TOPICS)[number]['value'],
  ...(typeof SUPPORT_TOPICS)[number]['value'][],
];

const supportRequestSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100, 'Name is too long.'),
  email: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(320, 'Email address is too long.'),
  topic: z.enum(topicValues, { message: 'Select a support topic.' }),
  message: z
    .string()
    .trim()
    .min(20, 'Please provide at least 20 characters so we can investigate.')
    .max(5000, 'Message must be 5,000 characters or fewer.'),
  website: z.string().max(0).optional().or(z.literal('')),
});

export type SupportRequestInput = z.infer<typeof supportRequestSchema>;
export type SupportTopic = SupportRequestInput['topic'];

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '');
}

export function parseSupportRequest(formData: FormData) {
  return supportRequestSchema.safeParse({
    name: formValue(formData, 'name'),
    email: formValue(formData, 'email'),
    topic: formValue(formData, 'topic'),
    message: formValue(formData, 'message'),
    website: formValue(formData, 'website'),
  });
}

export function supportTopicLabel(topic: SupportTopic) {
  return SUPPORT_TOPICS.find((candidate) => candidate.value === topic)?.label ?? 'Other';
}

export function supportNotificationPayload(input: {
  requestId: string;
  request: SupportRequestInput;
  submittedAt: string;
  userId: string | null;
}) {
  return {
    request_id: input.requestId,
    requester_name: input.request.name,
    requester_email: input.request.email,
    topic: supportTopicLabel(input.request.topic),
    message: input.request.message,
    submitted_at: input.submittedAt,
    user_id: input.userId ?? 'not-signed-in',
  };
}
