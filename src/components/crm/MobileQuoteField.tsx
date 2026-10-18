'use client';
import type { ReactNode } from 'react';
import { useQuickSelectPresentation } from '@mts/components/ui/select';
import {mobileQuoteFieldPurpose,type MobileFieldContext} from '@/lib/quote/mobile-quote-field-policy';
/** Same control and persisted key on desktop; purpose color and quote-only filtering on mobile. */
export function MobileQuoteField({field,context,children}:{field:string;context?:MobileFieldContext;children:ReactNode}){
 const {enabled}=useQuickSelectPresentation();
 if(!enabled)return <>{children}</>;
 const purpose=mobileQuoteFieldPurpose(field,context);
 if(purpose==='build')return null;
 return <div data-mobile-field={field} data-field-purpose={purpose} className="mobile-quote-field">{children}</div>;
}
