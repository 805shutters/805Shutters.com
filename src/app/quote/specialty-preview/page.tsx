import { notFound } from 'next/navigation';
import { SpecialtyPreview } from './SpecialtyPreview';
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <SpecialtyPreview/>;
}
