import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { NetatmoAuthorization } from '../models/netatmo-authorization';
import * as moment from 'moment';

@Injectable({
  providedIn: 'root',
})
export class NetatmoService {

  url = '';

  // date_begin = moment().startOf("isoWeek").unix(); // date_begin = 1572217200; // Timestamp 14/10/2019
  // date_end = moment().endOf("isoWeek").unix(); // date_end = 1572821999; // Timestamp 24/11/2019
  // https://www.epochconverter.com/
  // date_begin = moment('2019-11').startOf('month').unix();
  // date_end = moment('2019-12').endOf('month').unix();

  optimize = false; // it shows the date
  real_time = true; // true: 00:00 False 12:00

  constructor(private readonly http: HttpClient) {}

  buildAuthorizationUrl(): string {
    const state = 'dskfjqisfmjioeznf';
    sessionStorage.setItem('netatmo_state', state);
    return `https://api.netatmo.com/oauth2/authorize?client_id=${environment.netatmo.clientId}&redirect_uri=${
      environment.netatmo.redirectUri
    }&scope=read_station read_thermostat&state=${state}`;
  }

  exchangeCodeForAccessToken(state: string, code: string, error: string): Observable<NetatmoAuthorization> {
    const sessionStorageState = sessionStorage.getItem('netatmo_state');
    sessionStorage.removeItem('netatmo_state');
    if (error != null) {
      return throwError(new Error(error));
    } else if (state !== sessionStorageState) {
      return throwError(new Error('invalid_state'));
    }

    const body = new HttpParams()
      .set('grant_type', 'authorization_code')
      .set('client_id', environment.netatmo.clientId)
      .set('client_secret', environment.netatmo.clientSecret)
      .set('code', code)
      .set('redirect_uri', environment.netatmo.redirectUri)
      .set('scope', 'read_station read_thermostat');
    return this.http.post<NetatmoAuthorization>('https://api.netatmo.com/oauth2/token', body.toString(), {
      headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8'),
    });
  }

  refreshAccessToken(refreshToken: string): Observable<NetatmoAuthorization> {
    const body = new HttpParams()
      .set('grant_type', 'refresh_token')
      .set('client_id', environment.netatmo.clientId)
      .set('client_secret', environment.netatmo.clientSecret)
      .set('refresh_token', refreshToken);
    return this.http.post<NetatmoAuthorization>('https://api.netatmo.com/oauth2/token', body.toString(), {
      headers: new HttpHeaders().set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8'),
    });
  }

  getBoilerMeasure(access_token: string, scale: string, date_begin: number, date_end: number) {
    const Boiler_type = 'sum_boiler_on,sum_boiler_off';
    this.url = 'https://api.netatmo.com/api/getmeasure?' +
      'access_token=' + access_token + '&' +
      'device_id=' + environment.netatmo.boiler_device_id + '&' +
      'module_id=' + environment.netatmo.boiler_module_id + '&' +
      'scale=' + scale + '&' +
      'type=' + Boiler_type + '&' +
      'date_begin=' + date_begin + '&' +
      'date_end=' + date_end + '&' +
      'optimize=' + this.optimize + '&' +
      'real_time=' + this.real_time;
    return this.http.get(this.url);
  }

  getWeatherExternalMeasure(access_token: string, scale: string, date_begin: number, date_end: number) {
    const Weather_type = 'Temperature,Humidity,min_temp,max_temp,rain';
    this.url = 'https://api.netatmo.com/api/getmeasure?' +
      'access_token=' + access_token + '&' +
      'device_id=' + environment.netatmo.weather_device_id + '&' +
      'module_id=' + environment.netatmo.weather_External_module_id + '&' +
      'scale=' + scale + '&' +
      'type=' + Weather_type + '&' +
      'date_begin=' + date_begin + '&' +
      'date_end=' + date_end + '&' +
      'optimize=' + this.optimize + '&' +
      'real_time=' + this.real_time;
    return this.http.get(this.url);
  }

  getWeatherbedroomMeasure(access_token: string, scale: string, date_begin: number, date_end: number) {
    const Weather_type = 'Temperature,Humidity,min_temp,max_temp';
    this.url = 'https://api.netatmo.com/api/getmeasure?' +
      'access_token=' + access_token + '&' +
      'device_id=' + environment.netatmo.weather_device_id + '&' +
      'module_id=' + environment.netatmo.weather_Dormitorio_module_id + '&' +
      'scale=' + scale + '&' +
      'type=' + Weather_type + '&' +
      'date_begin=' + date_begin + '&' +
      'date_end=' + date_end + '&' +
      'optimize=' + this.optimize + '&' +
      'real_time=' + this.real_time;
    return this.http.get(this.url);
  }
}
