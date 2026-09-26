export interface ComponentFormNode {tag:string;attrs:Record<string,string|null>;children:(ComponentFormNode|string)[];}
export const componentForm:ComponentFormNode[]=[
 {
  "tag": "legend",
  "attrs": {},
  "children": [
   "组件与状态"
  ]
 },
 {
  "tag": "p",
  "attrs": {
   "id": "author-source-status",
   "class": "hint",
   "hidden": null
  },
  "children": []
 },
 {
  "tag": "button",
  "attrs": {
   "id": "author-source-return",
   "hidden": null
  },
  "children": [
   "返回原实例"
  ]
 },
 {
  "tag": "label",
  "attrs": {},
  "children": [
   "组件",
   {
    "tag": "select",
    "attrs": {
     "id": "author-component"
    },
    "children": []
   }
  ]
 },
 {
  "tag": "button",
  "attrs": {
   "id": "author-component-create"
  },
  "children": [
   "将选中容器设为组件"
  ]
 },
 {
  "tag": "details",
  "attrs": {
   "class": "component-section",
   "open": ""
  },
  "children": [
   {
    "tag": "summary",
    "attrs": {},
    "children": [
     "共享组件"
    ]
   },
   {
    "tag": "label",
    "attrs": {},
    "children": [
     "共享组件",
     {
      "tag": "select",
      "attrs": {
       "id": "author-library"
      },
      "children": []
     }
    ]
   },
   {
    "tag": "button",
    "attrs": {
     "id": "author-library-insert"
    },
    "children": [
     "插入共享实例"
    ]
   },
   {
    "tag": "button",
    "attrs": {
     "id": "author-library-edit"
    },
    "children": [
     "编辑共享源"
    ]
   }
  ]
 },
 {
  "tag": "div",
  "attrs": {
   "id": "author-component-edit",
   "hidden": null
  },
  "children": [
   {
    "tag": "p",
    "attrs": {
     "id": "author-instance-status"
    },
    "children": []
   },
   {
    "tag": "button",
    "attrs": {
     "id": "author-library-publish"
    },
    "children": [
     "发布或更新共享组件"
    ]
   },
   {
    "tag": "button",
    "attrs": {
     "id": "author-library-unlink"
    },
    "children": [
     "解除实例关联"
    ]
   },
   {
    "tag": "details",
    "attrs": {
     "class": "component-section",
     "open": "",
     "data-component-pending": ""
    },
    "children": [
     {
      "tag": "summary",
      "attrs": {},
      "children": [
       "实例覆盖"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       {
        "tag": "input",
        "attrs": {
         "id": "author-override-text-enabled",
         "type": "checkbox"
        },
        "children": []
       },
       "覆盖实例文字"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "实例文字覆盖",
       {
        "tag": "input",
        "attrs": {
         "id": "author-override-text"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "实例样式覆盖 JSON",
       {
        "tag": "textarea",
        "attrs": {
         "id": "author-override-style",
         "rows": "2"
        },
        "children": [
         "{}"
        ]
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-override-save"
      },
      "children": [
       "保存当前对象的实例覆盖"
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-override-reset"
      },
      "children": [
       "重置当前对象覆盖"
      ]
     }
    ]
   },
   {
    "tag": "details",
    "attrs": {
     "class": "component-section",
     "open": ""
    },
    "children": [
     {
      "tag": "summary",
      "attrs": {},
      "children": [
       "状态"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "组件名称",
       {
        "tag": "input",
        "attrs": {
         "id": "author-component-name"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "状态",
       {
        "tag": "select",
        "attrs": {
         "id": "author-state"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "状态名称",
       {
        "tag": "input",
        "attrs": {
         "id": "author-state-name"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-state-add"
      },
      "children": [
       "复制为新状态"
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-state-remove"
      },
      "children": [
       "删除状态"
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-state-preview"
      },
      "children": [
       "预览状态"
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-state-initial"
      },
      "children": [
       "设为初始状态"
      ]
     }
    ]
   },
   {
    "tag": "details",
    "attrs": {
     "class": "component-section",
     "open": ""
    },
    "children": [
     {
      "tag": "summary",
      "attrs": {},
      "children": [
       "对象在此状态的表现"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "编辑对象",
       {
        "tag": "select",
        "attrs": {
         "id": "author-target"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-target-select"
      },
      "children": [
       "选择内部对象"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       {
        "tag": "input",
        "attrs": {
         "id": "author-text-enabled",
         "type": "checkbox"
        },
        "children": []
       },
       "替换此状态的文字"
      ]
     },
     {
      "tag": "input",
      "attrs": {
       "id": "author-text"
      },
      "children": []
     },
     {
      "tag": "p",
      "attrs": {
       "id": "author-text-hint",
       "class": "hint",
       "hidden": null
      },
      "children": [
       "此对象包含内部元素或原生控件，请选择内部的纯文字对象修改内容。"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "可见性",
       {
        "tag": "select",
        "attrs": {
         "id": "author-visible"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {
           "value": ""
          },
          "children": [
           "沿用源稿"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "true"
          },
          "children": [
           "显示"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "false"
          },
          "children": [
           "隐藏"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {
       "data-component-pending": null
      },
      "children": [
       "状态样式 JSON",
       {
        "tag": "textarea",
        "attrs": {
         "id": "author-style",
         "rows": "3"
        },
        "children": [
         "{}"
        ]
       }
      ]
     },
     {
      "tag": "div",
      "attrs": {
       "class": "component-style-fields"
      },
      "children": [
       {
        "tag": "label",
        "attrs": {},
        "children": [
         "文字颜色",
         {
          "tag": "input",
          "attrs": {
           "id": "author-color",
           "placeholder": "沿用源稿，如 #6638dc"
          },
          "children": []
         }
        ]
       },
       {
        "tag": "label",
        "attrs": {},
        "children": [
         "背景颜色",
         {
          "tag": "input",
          "attrs": {
           "id": "author-background-color",
           "placeholder": "沿用源稿，如 #fff4cc"
          },
          "children": []
         }
        ]
       },
       {
        "tag": "label",
        "attrs": {},
        "children": [
         "透明度",
         {
          "tag": "input",
          "attrs": {
           "id": "author-opacity",
           "type": "number",
           "min": "0",
           "max": "1",
           "step": "0.1",
           "placeholder": "沿用源稿"
          },
          "children": []
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "原生图表选择",
       {
        "tag": "select",
        "attrs": {
         "id": "author-native-value"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {
           "value": ""
          },
          "children": [
           "沿用初始值"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "1.0"
          },
          "children": [
           "1.0"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "0.1"
          },
          "children": [
           "0.1"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "0.02"
          },
          "children": [
           "0.02"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-patch-save"
      },
      "children": [
       "保存对象状态"
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-state-override-reset",
       "hidden": null
      },
      "children": [
       "恢复此对象的共享状态"
      ]
     }
    ]
   },
   {
    "tag": "details",
    "attrs": {
     "class": "component-section",
     "open": ""
    },
    "children": [
     {
      "tag": "summary",
      "attrs": {},
      "children": [
       "切换效果"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "过渡时长（毫秒）",
       {
        "tag": "input",
        "attrs": {
         "id": "author-duration",
         "type": "number",
         "min": "0",
         "max": "10000"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "缓动",
       {
        "tag": "select",
        "attrs": {
         "id": "author-easing"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "ease"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "linear"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "ease-in"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "ease-out"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "ease-in-out"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-behavior-save"
      },
      "children": [
       "保存名称与过渡"
      ]
     }
    ]
   },
   {
    "tag": "details",
    "attrs": {
     "class": "component-section",
     "open": ""
    },
    "children": [
     {
      "tag": "summary",
      "attrs": {},
      "children": [
       "触发方式"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "触发事件",
       {
        "tag": "select",
        "attrs": {
         "id": "author-event"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {
           "value": "click"
          },
          "children": [
           "点击"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "pointerenter"
          },
          "children": [
           "移入"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "pointerleave"
          },
          "children": [
           "移出"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "从状态",
       {
        "tag": "select",
        "attrs": {
         "id": "author-from"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-event-add"
      },
      "children": [
       "用此对象切换到当前状态"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "已有事件",
       {
        "tag": "select",
        "attrs": {
         "id": "author-events"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-event-remove"
      },
      "children": [
       "删除事件"
      ]
     }
    ]
   },
   {
    "tag": "details",
    "attrs": {
     "class": "component-section",
     "open": "",
     "data-component-pending": ""
    },
    "children": [
     {
      "tag": "summary",
      "attrs": {},
      "children": [
       "步骤与容器布局"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "页内 step",
       {
        "tag": "input",
        "attrs": {
         "id": "author-step",
         "type": "number",
         "min": "0",
         "max": "500",
         "value": "1"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-step-save"
      },
      "children": [
       "此 step 切换到当前状态"
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-step-remove"
      },
      "children": [
       "移除此 step 映射"
      ]
     },
     {
      "tag": "p",
      "attrs": {
       "id": "author-step-list"
      },
      "children": []
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "组件布局",
       {
        "tag": "select",
        "attrs": {
         "id": "author-layout"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {
           "value": "row"
          },
          "children": [
           "横向排列"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "column"
          },
          "children": [
           "纵向排列"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "grid"
          },
          "children": [
           "网格"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "block"
          },
          "children": [
           "普通流"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "间距",
       {
        "tag": "input",
        "attrs": {
         "id": "author-gap",
         "type": "number",
         "min": "0",
         "value": "20"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "网格列数",
       {
        "tag": "input",
        "attrs": {
         "id": "author-columns",
         "type": "number",
         "min": "1",
         "max": "12",
         "value": "2"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-layout-save"
      },
      "children": [
       "应用容器布局"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "容器宽度",
       {
        "tag": "select",
        "attrs": {
         "id": "author-width"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {
           "value": "fixed"
          },
          "children": [
           "固定"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "hug"
          },
          "children": [
           "随内容"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "fill"
          },
          "children": [
           "填满父容器"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "容器高度",
       {
        "tag": "select",
        "attrs": {
         "id": "author-height"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {
           "value": "hug"
          },
          "children": [
           "随内容"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "fixed"
          },
          "children": [
           "固定"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "fill"
          },
          "children": [
           "填满父容器"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "固定宽度",
       {
        "tag": "input",
        "attrs": {
         "id": "author-width-value",
         "type": "number",
         "min": "0"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "固定高度",
       {
        "tag": "input",
        "attrs": {
         "id": "author-height-value",
         "type": "number",
         "min": "0"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "内边距",
       {
        "tag": "input",
        "attrs": {
         "id": "author-padding",
         "type": "number",
         "min": "0",
         "value": "0"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "交叉轴对齐",
       {
        "tag": "select",
        "attrs": {
         "id": "author-align"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "stretch"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "start"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "center"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "end"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "主轴分布",
       {
        "tag": "select",
        "attrs": {
         "id": "author-justify"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "start"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "center"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "end"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "space-between"
          ]
         },
         {
          "tag": "option",
          "attrs": {},
          "children": [
           "space-around"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       {
        "tag": "input",
        "attrs": {
         "id": "author-wrap",
         "type": "checkbox"
        },
        "children": []
       },
       "允许换行"
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "子对象宽度",
       {
        "tag": "select",
        "attrs": {
         "id": "author-child-width"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {
           "value": "fixed"
          },
          "children": [
           "固定"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "hug"
          },
          "children": [
           "随内容"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "fill"
          },
          "children": [
           "填满"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "子对象高度",
       {
        "tag": "select",
        "attrs": {
         "id": "author-child-height"
        },
        "children": [
         {
          "tag": "option",
          "attrs": {
           "value": "hug"
          },
          "children": [
           "随内容"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "fixed"
          },
          "children": [
           "固定"
          ]
         },
         {
          "tag": "option",
          "attrs": {
           "value": "fill"
          },
          "children": [
           "填满"
          ]
         }
        ]
       }
      ]
     },
     {
      "tag": "label",
      "attrs": {},
      "children": [
       "子对象伸展权重",
       {
        "tag": "input",
        "attrs": {
         "id": "author-grow",
         "type": "number",
         "min": "0",
         "value": "0"
        },
        "children": []
       }
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-child-layout-save"
      },
      "children": [
       "约束当前子对象"
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-parent-select"
      },
      "children": [
       "选择上一级容器"
      ]
     },
     {
      "tag": "button",
      "attrs": {
       "id": "author-component-detach"
      },
      "children": [
       "移除组件行为，保留内容"
      ]
     }
    ]
   }
  ]
 }
];
export interface ComponentControl {value?:string;checked?:boolean;disabled?:boolean;hidden?:boolean;text?:string;options?:Array<[string,string]>;}
export const componentDefaults:Record<string,ComponentControl>={
 "author-source-status": {
  "hidden": true,
  "disabled": false
 },
 "author-source-return": {
  "hidden": true,
  "disabled": false
 },
 "author-component": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "options": []
 },
 "author-component-create": {
  "hidden": false,
  "disabled": false
 },
 "author-library": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "options": []
 },
 "author-library-insert": {
  "hidden": false,
  "disabled": false
 },
 "author-library-edit": {
  "hidden": false,
  "disabled": false
 },
 "author-component-edit": {
  "hidden": true,
  "disabled": false
 },
 "author-instance-status": {
  "hidden": false,
  "disabled": false
 },
 "author-library-publish": {
  "hidden": false,
  "disabled": false
 },
 "author-library-unlink": {
  "hidden": false,
  "disabled": false
 },
 "author-override-text-enabled": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "checked": false
 },
 "author-override-text": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-override-style": {
  "hidden": false,
  "disabled": false,
  "value": "{}"
 },
 "author-override-save": {
  "hidden": false,
  "disabled": false
 },
 "author-override-reset": {
  "hidden": false,
  "disabled": false
 },
 "author-component-name": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-state": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "options": []
 },
 "author-state-name": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-state-add": {
  "hidden": false,
  "disabled": false
 },
 "author-state-remove": {
  "hidden": false,
  "disabled": false
 },
 "author-state-preview": {
  "hidden": false,
  "disabled": false
 },
 "author-state-initial": {
  "hidden": false,
  "disabled": false
 },
 "author-target": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "options": []
 },
 "author-target-select": {
  "hidden": false,
  "disabled": false
 },
 "author-text-enabled": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "checked": false
 },
 "author-text": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-text-hint": {
  "hidden": true,
  "disabled": false
 },
 "author-visible": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "options": [
   [
    "",
    "沿用源稿"
   ],
   [
    "true",
    "显示"
   ],
   [
    "false",
    "隐藏"
   ]
  ]
 },
 "author-style": {
  "hidden": false,
  "disabled": false,
  "value": "{}"
 },
 "author-color": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-background-color": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-opacity": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-native-value": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "options": [
   [
    "",
    "沿用初始值"
   ],
   [
    "1.0",
    "1.0"
   ],
   [
    "0.1",
    "0.1"
   ],
   [
    "0.02",
    "0.02"
   ]
  ]
 },
 "author-patch-save": {
  "hidden": false,
  "disabled": false
 },
 "author-state-override-reset": {
  "hidden": true,
  "disabled": false
 },
 "author-duration": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-easing": {
  "hidden": false,
  "disabled": false,
  "value": "ease",
  "options": [
   [
    "ease",
    "ease"
   ],
   [
    "linear",
    "linear"
   ],
   [
    "ease-in",
    "ease-in"
   ],
   [
    "ease-out",
    "ease-out"
   ],
   [
    "ease-in-out",
    "ease-in-out"
   ]
  ]
 },
 "author-behavior-save": {
  "hidden": false,
  "disabled": false
 },
 "author-event": {
  "hidden": false,
  "disabled": false,
  "value": "click",
  "options": [
   [
    "click",
    "点击"
   ],
   [
    "pointerenter",
    "移入"
   ],
   [
    "pointerleave",
    "移出"
   ]
  ]
 },
 "author-from": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "options": []
 },
 "author-event-add": {
  "hidden": false,
  "disabled": false
 },
 "author-events": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "options": []
 },
 "author-event-remove": {
  "hidden": false,
  "disabled": false
 },
 "author-step": {
  "hidden": false,
  "disabled": false,
  "value": "1"
 },
 "author-step-save": {
  "hidden": false,
  "disabled": false
 },
 "author-step-remove": {
  "hidden": false,
  "disabled": false
 },
 "author-step-list": {
  "hidden": false,
  "disabled": false
 },
 "author-layout": {
  "hidden": false,
  "disabled": false,
  "value": "row",
  "options": [
   [
    "row",
    "横向排列"
   ],
   [
    "column",
    "纵向排列"
   ],
   [
    "grid",
    "网格"
   ],
   [
    "block",
    "普通流"
   ]
  ]
 },
 "author-gap": {
  "hidden": false,
  "disabled": false,
  "value": "20"
 },
 "author-columns": {
  "hidden": false,
  "disabled": false,
  "value": "2"
 },
 "author-layout-save": {
  "hidden": false,
  "disabled": false
 },
 "author-width": {
  "hidden": false,
  "disabled": false,
  "value": "fixed",
  "options": [
   [
    "fixed",
    "固定"
   ],
   [
    "hug",
    "随内容"
   ],
   [
    "fill",
    "填满父容器"
   ]
  ]
 },
 "author-height": {
  "hidden": false,
  "disabled": false,
  "value": "hug",
  "options": [
   [
    "hug",
    "随内容"
   ],
   [
    "fixed",
    "固定"
   ],
   [
    "fill",
    "填满父容器"
   ]
  ]
 },
 "author-width-value": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-height-value": {
  "hidden": false,
  "disabled": false,
  "value": ""
 },
 "author-padding": {
  "hidden": false,
  "disabled": false,
  "value": "0"
 },
 "author-align": {
  "hidden": false,
  "disabled": false,
  "value": "stretch",
  "options": [
   [
    "stretch",
    "stretch"
   ],
   [
    "start",
    "start"
   ],
   [
    "center",
    "center"
   ],
   [
    "end",
    "end"
   ]
  ]
 },
 "author-justify": {
  "hidden": false,
  "disabled": false,
  "value": "start",
  "options": [
   [
    "start",
    "start"
   ],
   [
    "center",
    "center"
   ],
   [
    "end",
    "end"
   ],
   [
    "space-between",
    "space-between"
   ],
   [
    "space-around",
    "space-around"
   ]
  ]
 },
 "author-wrap": {
  "hidden": false,
  "disabled": false,
  "value": "",
  "checked": false
 },
 "author-child-width": {
  "hidden": false,
  "disabled": false,
  "value": "fixed",
  "options": [
   [
    "fixed",
    "固定"
   ],
   [
    "hug",
    "随内容"
   ],
   [
    "fill",
    "填满"
   ]
  ]
 },
 "author-child-height": {
  "hidden": false,
  "disabled": false,
  "value": "hug",
  "options": [
   [
    "hug",
    "随内容"
   ],
   [
    "fixed",
    "固定"
   ],
   [
    "fill",
    "填满"
   ]
  ]
 },
 "author-grow": {
  "hidden": false,
  "disabled": false,
  "value": "0"
 },
 "author-child-layout-save": {
  "hidden": false,
  "disabled": false
 },
 "author-parent-select": {
  "hidden": false,
  "disabled": false
 },
 "author-component-detach": {
  "hidden": false,
  "disabled": false
 }
};
