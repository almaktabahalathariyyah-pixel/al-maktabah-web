/**
 * Shared between the approvals desk (picks which of these to ask for) and the
 * account page (renders whichever were picked) so the labels never drift
 * out of sync between the two screens.
 */
export const VERIFY_CHANNELS = [
  { key: 'realSocial', label: 'ลิงก์โซเชียลที่มีชื่อ-รูปจริง (Facebook/Instagram)' },
  { key: 'phone', label: 'เบอร์โทรหรือ LINE ID ที่ติดต่อได้จริง' },
  { key: 'referral', label: 'ชื่อผู้แนะนำ หรือมัสยิด/สถาบันที่สังกัด' },
];
