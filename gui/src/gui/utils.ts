export const countChar = (string: string, char: string): number => {
    return string.split(char).length - 1;
};
