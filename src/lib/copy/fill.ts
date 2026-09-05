/**
 * Substitute `{token}` placeholders in a dictionary string.
 *
 * Dictionary values are plain strings, not functions, because the dictionary
 * is handed from a server component into a client provider and therefore has
 * to survive serialisation. This is the whole of the interpolation machinery
 * we need — no ICU, no plural rules: neither Chinese nor Malay inflects for
 * number, and the English cases are few enough to word around.
 */
export function fill(
	template: string,
	vars: Record<string, string | number>,
): string {
	return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
		key in vars ? String(vars[key]) : whole,
	);
}
