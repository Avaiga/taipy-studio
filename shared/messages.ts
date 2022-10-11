export interface ViewMessage<T = unknown> {
    viewId: string;
    props: T;
}

export type Positions = Record<string, Array<[number, number]>>;
