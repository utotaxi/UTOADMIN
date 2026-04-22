import { supabaseAdmin } from "@/lib/supabase";
import { Folder, FileText, Download, Car, FileImage, ShieldCheck, Search, Info, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SearchInput } from "./SearchInput";

export const dynamic = "force-dynamic";

export default async function DriverDocumentsPage({
    searchParams
}: {
    searchParams: Promise<{ driverId?: string, q?: string }>
}) {
    // Await search params in next 16+
    const params = await searchParams;
    const selectedDriverId = params?.driverId;
    const searchQuery = params?.q?.toLowerCase() || "";

    // 1. Fetch all drivers (minimal data for the list)
    const { data: drivers, error: driverError } = await supabaseAdmin
        .from('drivers')
        .select('id, user:user_id(email, full_name, profile_image, is_verified)')
        .order('created_at', { ascending: false });

    if (driverError) {
        console.error("Error fetching drivers:", driverError);
    }

    const filteredDrivers = drivers?.filter((driver: any) => {
        if (!searchQuery) return true;
        const fullName = (driver.user?.full_name || '').toLowerCase();
        const email = (driver.user?.email || '').toLowerCase();
        return fullName.includes(searchQuery) || email.includes(searchQuery);
    });

    // 2. Find the selected driver
    const selectedDriver = drivers?.find(d => d.id === selectedDriverId);
    const selectedEmail = (selectedDriver?.user as any)?.email;

    // 3. Fetch documents ONLY for the selected driver
    let documents: any[] = [];
    if (selectedEmail) {
        const folderName = selectedEmail.replace(/[^a-zA-Z0-9@._-]/g, '_');
        const { data: docs, error: docsError } = await supabaseAdmin
            .storage
            .from('driver_documents')
            .list(folderName);

        if (!docsError && docs) {
            documents = await Promise.all(docs.filter(f => f.name !== '.emptyFolderPlaceholder').map(async (file) => {
                const { data } = await supabaseAdmin.storage
                    .from('driver_documents')
                    .createSignedUrl(`${folderName}/${file.name}`, 60 * 60 * 24, { download: file.name });

                let docType = 'Other Document';
                if (file.name.includes('BankStatement')) docType = 'Bank Statement';
                if (file.name.includes('DvlaLicence')) docType = 'DVLA Licence';
                if (file.name.includes('NationalInsurance')) docType = 'National Insurance';
                if (file.name.includes('Phdl')) docType = 'Private Hire Driver Licence (PHDL)';
                if (file.name.includes('ProfilePhoto')) docType = 'Profile Photo';
                if (file.name.includes('Phvl')) docType = 'Private Hire Vehicle Licence (PHVL)';
                if (file.name.includes('Logbook')) docType = 'Logbook (V5C)';
                if (file.name.includes('Insurance') && !file.name.includes('NationalInsurance')) docType = 'Vehicle Insurance';
                if (file.name.includes('Inspection') || file.name.includes('Mot')) docType = 'MOT / Vehicle Inspection';
                if (file.name.includes('PcoBadge')) docType = 'PCO Badge';

                return {
                    name: file.name,
                    url: data?.signedUrl || '',
                    type: docType,
                    created_at: file.created_at,
                    size: file.metadata?.size || 0,
                };
            }));
        }
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12 h-[calc(100vh-2rem)]">
            <div className="flex flex-col gap-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Link href="/drivers" className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-muted-foreground hover:text-foreground inline-flex items-center justify-center group" aria-label="Go back to Drivers">
                        <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
                    </Link>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        <FileText className="w-8 h-8 text-primary" /> Driver Documents
                    </h1>
                </div>
                <p className="text-muted-foreground sm:pl-[56px]">Select a driver from the list to view their uploaded documentation securely.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
                {/* Left Pane - Driver List */}
                <div className="w-full md:w-1/3 lg:w-1/4 rounded-xl border bg-card shadow-sm flex flex-col overflow-hidden">
                    <div className="p-4 border-b bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-center">
                        <Suspense fallback={<div className="h-[42px] w-full bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />}>
                            <SearchInput />
                        </Suspense>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-1">
                        {filteredDrivers && filteredDrivers.length > 0 ? (
                            filteredDrivers.map((driver: any) => {
                                const isSelected = driver.id === selectedDriverId;
                                return (
                                    <Link 
                                        href={`/driver-documents?driverId=` + driver.id} 
                                        key={driver.id}
                                        className={`flex flex-col p-3 rounded-lg border border-transparent transition-colors ${
                                            isSelected 
                                                ? 'bg-primary/10 border-primary/20 text-primary-foreground' 
                                                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 relative rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0">
                                                {(driver.user as any)?.profile_image ? (
                                                    <img src={(driver.user as any).profile_image} alt={(driver.user as any).full_name} className="object-cover w-full h-full" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400">
                                                        <Car className="w-5 h-5" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                                        {(driver.user as any)?.full_name || 'Unknown Driver'}
                                                    </span>
                                                    {(driver.user as any)?.is_verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                                                </div>
                                                <span className={`text-xs truncate ${isSelected ? 'text-primary/70' : 'text-muted-foreground'}`}>
                                                    {(driver.user as any)?.email}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })
                        ) : (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                No drivers found.
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Pane - Documents Details */}
                <div className="w-full md:w-2/3 lg:w-3/4 rounded-xl border bg-card shadow-sm flex flex-col overflow-hidden p-6 relative">
                    {selectedDriver ? (
                        <div className="flex flex-col h-full h-full">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b mb-6">
                                <div>
                                    <h2 className="text-xl font-bold text-foreground">
                                        Documents for {(selectedDriver.user as any)?.full_name || 'Driver'}
                                    </h2>
                                    <p className="text-sm text-muted-foreground mt-1">{(selectedDriver.user as any)?.email}</p>
                                </div>
                                <Link 
                                    href={`/drivers/${selectedDriver.id}`}
                                    className="mt-4 sm:mt-0 px-4 py-2 text-sm font-medium border rounded-lg bg-background hover:bg-slate-50 transition-colors"
                                >
                                    View Full Profile
                                </Link>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 pb-4">
                                {documents.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                        {documents.map((doc: any, i: number) => (
                                            <div key={i} className="group relative flex flex-col rounded-xl border bg-background overflow-hidden hover:shadow-lg transition-all duration-300 hover:border-primary/50">
                                                <a href={doc.url} target="_blank" rel="noopener noreferrer" download={doc.name} className="absolute inset-0 z-10" aria-label={`View ${doc.type}`} />
                                                
                                                <div className="flex items-center gap-3 p-3.5 border-b bg-slate-50/50 dark:bg-slate-800/20">
                                                    <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                                                        <FileImage className="w-4.5 h-4.5" />
                                                    </div>
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span className="text-sm font-semibold truncate text-foreground">{doc.type}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase opacity-80 mt-0.5 w-fit font-medium">
                                                            {(doc.size / 1024).toFixed(1)} KB &bull; {new Date(doc.created_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-background border shadow-sm text-primary z-20 hover:bg-primary hover:text-white">
                                                        <Download className="w-4 h-4" />
                                                    </div>
                                                </div>
                                                
                                                <div className="h-40 w-full bg-slate-100 dark:bg-slate-900/50 flex items-center justify-center p-3 relative overflow-hidden group-hover:bg-slate-200 dark:group-hover:bg-slate-800 transition-colors">
                                                    {doc.url ? (
                                                        <img 
                                                            src={doc.url} 
                                                            alt={doc.name} 
                                                            className="h-full w-full object-contain mix-blend-multiply dark:mix-blend-normal opacity-90 group-hover:opacity-100 transition-opacity group-hover:scale-105 duration-500 ease-out"
                                                        />
                                                    ) : (
                                                        <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border-2 border-dashed rounded-xl bg-slate-50/50 dark:bg-slate-900/30 mt-4">
                                        <Folder className="w-12 h-12 mb-4 opacity-20" />
                                        <p className="font-semibold text-base text-foreground">No documents uploaded</p>
                                        <p className="text-sm opacity-70 mt-1 max-w-[300px] text-center">
                                            This directory is currently empty. Docs synced from the driver app will arrive here.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-60">
                            <Info className="w-12 h-12 mb-4 opacity-30" />
                            <p className="font-medium text-lg">No Driver Selected</p>
                            <p className="text-sm mt-1 max-w-[250px] text-center">
                                Please select a driver from the list on the left to view their documents.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
