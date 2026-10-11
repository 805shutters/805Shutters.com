import { notFound } from 'next/navigation';
import { HeaderOptions } from '../HeaderOptions';
export default function Page(){
 if(process.env.NODE_ENV !== 'development') notFound();
 return <HeaderOptions phone/>;
}
