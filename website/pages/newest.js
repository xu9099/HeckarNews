import HeadMetadata from "../components/headMetadata.js";
import Header from "../components/header.js";
import Footer from "../components/footer.js";

import getNewestItemsByPage from "../apix/items/getNewestItemsByPage.js";

import ItemsList from "../components/itemsList.js";

export default function Newest({ items, authUserData, page, isMore, getDataError, goToString }) {
    return (
        <div className="layout-wrapper">
            <HeadMetadata title="Newest Items | HeckarNews" />
            <Header
                userSignedIn={authUserData && authUserData.userSignedIn}
                username={authUserData && authUserData.username}
                karma={authUserData && authUserData.karma}
                goto={goToString}
                pageName="newest"
            />
            <div className="items-list-content-container">
                {!getDataError ? (
                    <>
                        <ItemsList
                            items={items}
                            goToString={goToString}
                            userSignedIn={authUserData.userSignedIn}
                            currUsername={authUserData.username}
                            showHideOption={true}
                            showRank={true}
                            showWebLink={true}
                            showPastLink={true}
                            isMoreLink={`/newest?page=${page + 1}`}
                            isMore={isMore}
                            isModerator={authUserData.isModerator}
                        />
                    </>
                ) : (
                    <div className="items-list-error-msg">
                        <span>An error occurred.</span>
                    </div>
                )}
            </div>
            <Footer />
        </div>
    );
}

export async function getServerSideProps({ req, query }) {
    const page = query.page ? parseInt(query.page) : 1;

    const apiResult = await getNewestItemsByPage(page, req);

    return {
        props: {
            items: (apiResult && apiResult.items) || [],
            authUserData: apiResult && apiResult.authUser ? apiResult.authUser : {},
            page: page || 0,
            isMore: (apiResult && apiResult.isMore) || false,
            getDataError: (apiResult && apiResult.getDataError) || false,
            goToString: page > 1 ? `newest?page=${page}` : "newest",
        },
    };
}
