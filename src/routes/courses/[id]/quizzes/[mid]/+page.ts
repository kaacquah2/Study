import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params, url }) => {
	redirect(308, `/app/courses/${params.id}/${params.mid}${url.search}`);
};
