import { notFound } from 'next/navigation';
import { AttachmentReview } from './AttachmentReview';
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <AttachmentReview />;
}
