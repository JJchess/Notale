import {StrictMode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {Editor} from '../../src/components/editor';
import '../../src/editor.css';
let root:Root|undefined;
Object.assign(window,{EditorLifecycle:{
 mount(){if(root)throw Error('Already mounted');root=createRoot(document.getElementById('root')!);root.render(<StrictMode><Editor/></StrictMode>);},
 unmount(){root?.unmount();root=undefined;},
}});
