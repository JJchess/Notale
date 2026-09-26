export type GeometryProperty='tx'|'ty'|'rotation'|'scale'|'object-width'|'object-height';
export interface GeometryFieldsState {key:string;documentId:string;slideId:string;ids:string[];values:Record<GeometryProperty,number>;editable:boolean;}
export interface GeometryFieldEdit {source:GeometryFieldsState;field:GeometryProperty;value:number;proportional:boolean;}
