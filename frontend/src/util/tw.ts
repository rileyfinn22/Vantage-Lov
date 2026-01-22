import * as React from 'react';
import type { JSX } from 'react';

type TwProxy = {
    [K in keyof JSX.IntrinsicElements]: (strings: TemplateStringsArray, ...values: any[]) => React.FC<JSX.IntrinsicElements[K]>;
};

export const tw = new Proxy({} as TwProxy, {
    get(_, tag: string) {
        // called as tw.div`…`
        return (strings: TemplateStringsArray, ...values: any[]) => {
            // build the raw class string
            const classes = strings
                .map((s, i) => s + (values[i] || ''))
                .join('')
                .trim();
            // return a React component
            return (props: object & { className?: string; children?: React.ReactNode }) =>
                React.createElement(
                    tag,
                    {
                        ...props,
                        className: [classes, props.className].filter(Boolean).join(' '),
                    },
                    props.children,
                );
        };
    },
});
