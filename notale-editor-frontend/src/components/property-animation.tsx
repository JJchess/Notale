'use client';
import {createContext,useContext,type ComponentType} from 'react';
/** Optional surface capability; ordinary Notale fields keep their existing behavior. */
export const PropertyAnimationContext=createContext<ComponentType<{property:string}>|undefined>(undefined);
export function PropertyAnimation({property}:{property:string}){const Key=useContext(PropertyAnimationContext);return Key?<Key property={property}/>:null;}
