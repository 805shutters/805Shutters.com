'use client';
import {Children,isValidElement,type SelectHTMLAttributes} from 'react';
import {useQuickSelectPresentation} from '@mts/components/ui/select';
import {MobileQuoteField} from './MobileQuoteField';
import {QuoteChoiceButtons} from './QuoteChoiceButtons';
type Props=Omit<SelectHTMLAttributes<HTMLSelectElement>,'onChange'> & {field?:string;onChange?:(event:{target:{value:string}})=>void};
/** Mobile choices use buttons; only color lists retain a dropdown. */
export function QuickQuoteSelect({field,children,onChange,...props}:Props){
 const presentation=useQuickSelectPresentation();
 const choices=Children.toArray(children).filter(c=>isValidElement<{value?:string}>(c)&&c.props.value!=='');
 const isColor=/color|colour/i.test(`${field??''} ${props['aria-label']??''}`);
 const control=presentation.enabled&&choices.length>0&&!isColor&&!props.disabled?<QuoteChoiceButtons value={String(props.value??'')} aria-label={props['aria-label']??'Product choice'} onChange={value=>onChange?.({target:{value}})}>{children}</QuoteChoiceButtons>:<select {...props} onChange={event=>onChange?.({target:{value:event.target.value}})}>{children}</select>;
 return field?<MobileQuoteField field={field}>{control}</MobileQuoteField>:control;
}
