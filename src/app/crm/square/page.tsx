import { CrmApp } from '@/components/crm/CrmApp';
import { privatePageMetadata } from '@/lib/private-page-metadata';
export const metadata = privatePageMetadata('805 CRM Payment Hub');
export default function SquarePage() { return <CrmApp initialTab="square" />; }
