export interface ViewMessage<T = unknown> {
    name: string;
    props: T;
}