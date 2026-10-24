/** Internal normalized-evidence seam; not a producer JSON schema or an auth grant. */
export type NativeAuthorityDecoder = (payload: unknown) => unknown;

/** No complete reviewed public generation/auth schema has been supplied.
 * Source must implement its exact decoder here before any normal acquisition.
 * There is no constructor/config/environment override. Offline tests mock this
 * module with synthetic producer evidence; that never enables a deployed route. */
export function getReviewedNativeAuthorityDecoder(): NativeAuthorityDecoder | undefined {
	return undefined;
}
