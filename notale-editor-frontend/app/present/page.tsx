import type {Metadata} from 'next';
import {PresentationEntry} from '../../src/presentation/entry';
export const metadata:Metadata={title:'Notale · 放映'};
export default function PresentPage(){return <PresentationEntry/>;}
