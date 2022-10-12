export interface ViewMessage<T = unknown> {
    viewId: string;
    props: T;
}

export interface EditorAddNodeMessage {
    editorMessage: boolean;
    nodeType: string;
    nodeName: string;
}

export type Positions = Record<string, Array<[number, number]>>;
