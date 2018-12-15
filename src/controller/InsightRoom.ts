export interface InsightRoom {
    fullname: string;
    shortname: string;
    address: string;
    geoLocation: InsightGeoResponse;
    number?: string;
    name?: string;
    type?: string;
    seats?: number;
    furniture?: string;
    href?: string;
}
export interface InsightGeoResponse {
    lat?: number;
    lon?: number;
    error?: string;
}
export class InsightRoom implements InsightRoom {
    constructor(fullname: string, shortname: string, address: string, geoLocation: InsightGeoResponse,
                type?: string, name?: string,  num?: string, seats?: number,
                furniture?: string, href?: string) {
        this.fullname = fullname;
        this.shortname = shortname;
        this.address = address;
        this.geoLocation = geoLocation;
        this.name = name;
        this.number = num;
        this.seats = seats;
        this.type = type;
        this.furniture = furniture;
        this.href = href;
    }
}
