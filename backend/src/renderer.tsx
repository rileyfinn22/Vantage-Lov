import { Style } from "hono/css";
import { jsxRenderer } from "hono/jsx-renderer";

export const renderer = jsxRenderer(({ children }) => {
	return (
		<html lang="en">
			<head>
				<Style />
				{/* <ViteClient />
        <Link href="/src/style.css" rel="stylesheet" /> */}
			</head>
			<body>{children}</body>
		</html>
	);
});
