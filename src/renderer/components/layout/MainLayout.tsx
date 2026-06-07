import { Outlet } from "react-router-dom";
import TopMenuBar from "@/features/navigation/TopMenuBar";
import LeftSidebar from "@/features/navigation/LeftSidebar";
import RightSidebar from "@/features/navigation/RightSidebar";
import BottomToolbar from "@/features/canvas/BottomToolbar";
import { useAppStore } from "@/lib/store/index";

const MainLayout: React.FC = () => {
    const currentImage = useAppStore((state) => state.currentImage);
    const isComparisonMode = useAppStore((state) => state.isComparisonMode);
    const comparison = useAppStore((state) => state.comparison);

    const hasImageForToolbar = isComparisonMode
        ? !!(comparison?.left?.image || comparison?.right?.image)
        : !!currentImage;

    return (
        <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
            <TopMenuBar />
            <div className="flex flex-1 pt-16 h-screen overflow-hidden">
                <LeftSidebar />
                <main className="flex-1 relative bg-black overflow-hidden flex flex-col">
                    {/* Grid Overlay can go here */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
                        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.22) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
                    </div>

                    <Outlet />

                    {hasImageForToolbar && <BottomToolbar />}
                </main>
                <RightSidebar />
            </div>
        </div>
    );
};

export default MainLayout;
